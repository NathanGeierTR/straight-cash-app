import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, forkJoin } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface GitHubUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  draft: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: GitHubUser;
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  labels: GitHubLabel[];
  repository: GitHubRepo;
  repository_url: string;
  comments: number;
  review_comments: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubPullRequest[];
}

export type PrFilter = 'assigned' | 'review-requested' | 'all';

export type PrReviewState =
  | 'open'
  | 'draft'
  | 'approved'
  | 'changes-requested'
  | 'review-requested'
  | 'merged'
  | 'closed'
  | 'unknown';

export interface DiagnosticInfo {
  lastQuery: string | null;
  totalCount: number | null;
  httpStatus: number | null;
  httpMessage: string | null;
  resolvedUsername: string | null;
}

const STORAGE_KEY = 'github-pr-token';
const STORAGE_USERNAME_KEY = 'github-pr-username';
const STORAGE_ORG_KEY = 'github-pr-org';
const STORAGE_REPO_KEY = 'github-pr-repo';

@Injectable({
  providedIn: 'root'
})
export class GitHubPrService {
  private readonly apiBase = '/github-api';

  private token = '';
  private username = '';
  private org = '';
  private repo = '';

  private prsSubject = new BehaviorSubject<GitHubPullRequest[]>([]);
  public prs$ = this.prsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  private diagnosticSubject = new BehaviorSubject<DiagnosticInfo>({
    lastQuery: null, totalCount: null, httpStatus: null, httpMessage: null, resolvedUsername: null
  });
  public diagnostic$ = this.diagnosticSubject.asObservable();

  // Emits the GitHub login name once the token is verified — null while unverified
  private verifiedUsernameSubject = new BehaviorSubject<string | null>(null);
  public verifiedUsername$ = this.verifiedUsernameSubject.asObservable();

  // Emits whenever org or repo config changes so dependents can rebuild caches
  private repoConfigSubject = new Subject<void>();
  public repoConfig$ = this.repoConfigSubject.asObservable();

  // Cache of review states for individually-fetched PRs keyed by PR number
  private linkedPrStatusesSubject = new BehaviorSubject<Map<number, PrReviewState>>(new Map());
  public linkedPrStatuses$ = this.linkedPrStatusesSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  // ── Configuration ────────────────────────────────────────────

  initialize(token: string): void {
    this.token = token.trim();
    this.username = '';
    this.verifiedUsernameSubject.next(null);
    this.saveConfiguration();
    this.connectedSubject.next(true);

    // Always verify the token against the API — never trust a manually typed username
    this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: '(verifying…)' });
    this.fetchAuthenticatedUser().subscribe({
      next: user => {
        this.username = user.login;
        localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
        this.verifiedUsernameSubject.next(user.login);
        this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login });
      },
      error: (err: HttpErrorResponse) => {
        const status = err?.status ?? null;
        const msg = err?.error?.message ?? null;
        this.diagnosticSubject.next({
          ...this.diagnosticSubject.value,
          resolvedUsername: `ERROR ${status ?? '?'}${msg ? ': ' + msg : ''}`,
          httpStatus: status,
          httpMessage: msg
        });
      }
    });
  }

  clearConfiguration(): void {
    this.token = '';
    this.username = '';
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_USERNAME_KEY);
    this.connectedSubject.next(false);
    this.verifiedUsernameSubject.next(null);
    this.prsSubject.next([]);
    this.errorSubject.next(null);
  }

  isConfigured(): boolean {
    return !!this.token;
  }

  getUsername(): string {
    return this.username;
  }

  getOrg(): string {
    return this.org;
  }

  setOrg(org: string): void {
    this.org = org.trim();
    localStorage.setItem(STORAGE_ORG_KEY, this.org);
    this.repoConfigSubject.next();
  }

  getRepo(): string {
    return this.repo;
  }

  setRepo(repo: string): void {
    this.repo = repo.trim();
    localStorage.setItem(STORAGE_REPO_KEY, this.repo);
    this.repoConfigSubject.next();
  }

  /**
   * Build a GitHub PR URL from just a PR number using the stored org+repo.
   * Returns null if org or repo are not configured.
   */
  getDefaultPrUrl(prNumber: number): string | null {
    if (!this.org || !this.repo) return null;
    return `https://github.com/${this.org}/${this.repo}/pull/${prNumber}`;
  }

  /** Re-run the /user call and update diagnostics — useful for manual troubleshooting. */
  verifyToken(): void {
    this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: '(verifying…)' });
    this.verifiedUsernameSubject.next(null);
    this.fetchAuthenticatedUser().subscribe({
      next: user => {
        this.username = user.login;
        localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
        this.verifiedUsernameSubject.next(user.login);
        this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login, httpStatus: 200, httpMessage: null });
      },
      error: (err: HttpErrorResponse) => {
        const status = err?.status ?? null;
        const msg = err?.error?.message ?? null;
        this.diagnosticSubject.next({
          ...this.diagnosticSubject.value,
          resolvedUsername: `ERROR ${status ?? '?'}${msg ? ': ' + msg : ''}`,
          httpStatus: status,
          httpMessage: msg
        });
      }
    });
  }

  private saveConfiguration(): void {
    localStorage.setItem(STORAGE_KEY, this.token);
    localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
  }

  private loadConfiguration(): void {
    this.token = localStorage.getItem(STORAGE_KEY) || '';
    this.username = localStorage.getItem(STORAGE_USERNAME_KEY) || '';
    this.org = localStorage.getItem(STORAGE_ORG_KEY) || '';
    this.repo = localStorage.getItem(STORAGE_REPO_KEY) || '';
    this.connectedSubject.next(!!this.token);

    if (this.token) {
      // Immediately populate diagnostics with whatever is stored, then re-verify
      this.verifiedUsernameSubject.next(this.username || null);
      this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: this.username || '(verifying…)' });

      // Verify actual identity from the token — corrects a wrong/missing stored username
      this.fetchAuthenticatedUser().subscribe({
        next: user => {
          this.username = user.login;
          localStorage.setItem(STORAGE_USERNAME_KEY, this.username);
          this.verifiedUsernameSubject.next(user.login);
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, resolvedUsername: user.login });
        },
        error: (err: HttpErrorResponse) => {
          const status = err?.status ?? null;
          const msg = err?.error?.message ?? null;
          this.diagnosticSubject.next({
            ...this.diagnosticSubject.value,
            resolvedUsername: `ERROR ${status ?? '?'}${msg ? ': ' + msg : ''}`,
            httpStatus: status,
            httpMessage: msg
          });
        }
      });
    }
  }

  // ── HTTP helpers ─────────────────────────────────────────────

  private headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    });
  }

  // ── Core API calls ───────────────────────────────────────────

  /**
   * Fetch the authenticated user's login (to verify token and auto-fill username).
   */
  fetchAuthenticatedUser(): Observable<GitHubUser> {
    return this.http.get<GitHubUser>(`${this.apiBase}/user`, {
      headers: this.headers()
    });
  }

  /**
   * Search for open pull requests by filter type.
   *   'assigned'         – PRs where you are an assignee
   *   'review-requested' – PRs where your review is requested
   *   'all'              – both of the above combined
   */
  fetchPullRequests(filter: PrFilter = 'assigned'): Observable<GitHubPullRequest[]> {
    if (!this.token) {
      this.errorSubject.next('GitHub token not configured.');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    let query: string;
    const actor = this.username || '@me';
    const orgClause = this.org ? ` org:${this.org}` : '';

    if (filter === 'all') {
      query = `is:pr is:open involves:${actor}${orgClause} archived:false`;
    } else if (filter === 'review-requested') {
      query = `is:pr is:open review-requested:${actor}${orgClause} archived:false`;
    } else {
      query = `is:pr is:open assignee:${actor}${orgClause} archived:false`;
    }

    const url = `${this.apiBase}/search/issues?q=${encodeURIComponent(query)}&per_page=50&sort=updated&order=desc`;

    this.diagnosticSubject.next({ ...this.diagnosticSubject.value, lastQuery: query, totalCount: null, httpStatus: null, httpMessage: null });

    return this.http
      .get<GitHubSearchResult>(url, { headers: this.headers() })
      .pipe(
        map(result => {
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, totalCount: result.total_count, httpStatus: 200, httpMessage: null });
          return this.normalizeSearchItems(result.items);
        }),
        tap(prs => {
          this.prsSubject.next(prs);
          this.loadingSubject.next(false);
        }),
        catchError(err => {
          const httpErr = err as HttpErrorResponse;
          const status = httpErr?.status ?? null;
          const apiMessage = httpErr?.error?.message ?? null;
          const message = apiMessage
            ? `GitHub API error ${status}: ${apiMessage}`
            : `HTTP ${status ?? '?'}: Failed to fetch pull requests.`;
          this.diagnosticSubject.next({ ...this.diagnosticSubject.value, httpStatus: status, httpMessage: message });
          this.errorSubject.next(message);
          this.loadingSubject.next(false);
          return of([]);
        })
      );
  }

  /**
   * The Search API returns issues/PRs. Normalize into GitHubPullRequest shape
   * and add the repository info parsed from repository_url.
   */
  private normalizeSearchItems(items: any[]): GitHubPullRequest[] {
    return items.map(item => {
      const repoFullName = this.repoFullNameFromUrl(item.repository_url ?? '');
      return {
        ...item,
        state: item.state as 'open' | 'closed',
        draft: item.draft ?? false,
        assignees: item.assignees ?? [],
        requested_reviewers: item.requested_reviewers ?? [],
        labels: item.labels ?? [],
        comments: item.comments ?? 0,
        review_comments: item.review_comments ?? 0,
        repository: {
          id: 0,
          name: repoFullName.split('/')[1] ?? '',
          full_name: repoFullName,
          html_url: `https://github.com/${repoFullName}`
        }
      } as GitHubPullRequest;
    });
  }

  private repoFullNameFromUrl(repositoryUrl: string): string {
    // e.g. https://api.github.com/repos/owner/repo → owner/repo
    const match = repositoryUrl.match(/\/repos\/(.+)$/);
    return match ? match[1] : '';
  }

  /**
   * Fetch review status for a single PR by number, using the configured org+repo.
   * Derives an effective PrReviewState from the PR details and its reviews.
   * Results are cached so subsequent calls for the same number are no-ops.
   */
  fetchLinkedPrStatus(prNumber: number): void {
    if (!this.token || !this.org || !this.repo) return;
    const current = this.linkedPrStatusesSubject.value;
    if (current.has(prNumber)) return; // already fetched

    const base = `${this.apiBase}/repos/${this.org}/${this.repo}`;
    forkJoin({
      pr: this.http.get<any>(`${base}/pulls/${prNumber}`, { headers: this.headers() }),
      reviews: this.http.get<any[]>(`${base}/pulls/${prNumber}/reviews`, { headers: this.headers() })
    }).pipe(
      catchError(() => of(null))
    ).subscribe(result => {
      if (!result) return;
      const { pr, reviews } = result;

      let state: PrReviewState = 'unknown';

      if (pr.merged_at) {
        state = 'merged';
      } else if (pr.state === 'closed') {
        state = 'closed';
      } else if (pr.draft) {
        state = 'draft';
      } else {
        // Derive effective review decision from the reviews list:
        // Take the last non-COMMENTED review per reviewer
        const latest = new Map<string, string>();
        for (const review of reviews) {
          if (review.state !== 'COMMENTED') {
            latest.set(review.user.login, review.state);
          }
        }
        const states = Array.from(latest.values());
        if (states.includes('CHANGES_REQUESTED')) {
          state = 'changes-requested';
        } else if (states.length > 0 && states.every(s => s === 'APPROVED')) {
          state = 'approved';
        } else if ((pr.requested_reviewers?.length ?? 0) > 0) {
          state = 'review-requested';
        } else {
          state = 'open';
        }
      }

      const updated = new Map(this.linkedPrStatusesSubject.value);
      updated.set(prNumber, state);
      this.linkedPrStatusesSubject.next(updated);
    });
  }
}