import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number; // 0=none,1=urgent,2=high,3=medium,4=low
  url: string;
  updatedAt: string;
  dueDate: string | null;
  estimate: number | null;
  state: {
    name: string;
    color: string;
    type: string; // backlog, unstarted, started, completed, cancelled
  };
  team: { name: string };
  labels: { nodes: { name: string; color: string }[] };
  project: { name: string } | null;
  cycle: {
    id: string;
    name: string;
    number: number;
    startsAt: string;
    endsAt: string;
    progress: number;
    team: { name: string };
  } | null;
}

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
}

export interface LinearCustomView {
  id: string;
  name: string;
  description: string | null;
}

export interface LinearCycle {
  id: string;
  name: string;
  number: number;
  startsAt: string;
  endsAt: string;
  team: { name: string };
  progress: number; // 0–1
}

const STORAGE_KEY = 'linear-api-key';

@Injectable({ providedIn: 'root' })
export class LinearService {
  private apiKey = '';

  private issuesSubject = new BehaviorSubject<LinearIssue[]>([]);
  readonly issues$ = this.issuesSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  readonly error$ = this.errorSubject.asObservable();

  private configuredSubject = new BehaviorSubject<boolean>(false);
  readonly isConfigured$ = this.configuredSubject.asObservable();

  private viewerSubject = new BehaviorSubject<LinearViewer | null>(null);
  readonly viewer$ = this.viewerSubject.asObservable();

  private activeCycleSubject = new BehaviorSubject<LinearCycle | null>(null);
  readonly activeCycle$ = this.activeCycleSubject.asObservable();

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      this.apiKey = saved;
      this.configuredSubject.next(true);
    }
  }

  isConfigured(): boolean {
    return this.configuredSubject.value;
  }

  initialize(apiKey: string): void {
    this.apiKey = apiKey.trim();
    localStorage.setItem(STORAGE_KEY, this.apiKey);
    this.configuredSubject.next(true);
  }

  clearConfiguration(): void {
    this.apiKey = '';
    localStorage.removeItem(STORAGE_KEY);
    this.configuredSubject.next(false);
    this.issuesSubject.next([]);
    this.viewerSubject.next(null);
    this.activeCycleSubject.next(null);
    this.errorSubject.next(null);
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': this.apiKey,
    });
  }

  private gql<T>(query: string, variables?: Record<string, unknown>): Observable<T> {
    return this.http.post<{ data: T; errors?: { message: string }[] }>(
      `${environment.linearApiUrl}/graphql`,
      { query, variables },
      { headers: this.headers }
    ).pipe(
      map(res => {
        if (res.errors?.length) throw new Error(res.errors.map(e => e.message).join('; '));
        return res.data;
      })
    );
  }

  fetchViewer(): Observable<LinearViewer> {
    const query = `query { viewer { id name email } }`;
    return this.gql<{ viewer: LinearViewer }>(query).pipe(
      map(d => d.viewer),
      tap(v => this.viewerSubject.next(v)),
      catchError(err => {
        this.errorSubject.next(err.message ?? 'Failed to verify token');
        throw err;
      })
    );
  }

  fetchMyIssues(includeCompleted = false): Observable<LinearIssue[]> {
    if (!this.apiKey) return of([]);

    const excludedStates = includeCompleted ? '["cancelled"]' : '["completed", "cancelled"]';

    const query = `
      query MyIssues {
        viewer {
          assignedIssues(
            filter: { state: { type: { nin: ${excludedStates} } } }
            orderBy: updatedAt
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              url
              updatedAt
              dueDate
              estimate
              state { name color type }
              team { name }
              labels { nodes { name color } }
              project { name }
              cycle { id name number startsAt endsAt progress team { name } }
            }
          }
        }
      }
    `;

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.gql<{ viewer: { assignedIssues: { nodes: LinearIssue[] } } }>(query).pipe(
      map(d => d.viewer.assignedIssues.nodes),
      tap(issues => {
        this.issuesSubject.next(issues);
        this.loadingSubject.next(false);
        // Derive the active cycle from cycle fields on assigned issues.
        // Multiple issues may reference different cycles (different teams,
        // overlapping cadences). We collect all cycles whose date window
        // contains today, deduplicate by id, then pick the one with the
        // earliest startsAt so we always get the broadest/primary sprint
        // rather than whichever cycle happened to be on the most-recently-
        // updated issue (which caused the intermittent Apr 27 vs Apr 22 bug).
        const today = new Date();
        const seen = new Map<string, NonNullable<LinearIssue['cycle']>>();
        for (const issue of issues) {
          const c = issue.cycle;
          if (c && !seen.has(c.id) && new Date(c.startsAt) <= today && new Date(c.endsAt) >= today) {
            seen.set(c.id, c);
          }
        }
        const activeCycles = [...seen.values()];
        const activeCycle = activeCycles.length === 0 ? null
          : activeCycles.reduce((best, c) =>
              new Date(c.startsAt) < new Date(best.startsAt) ? c : best
            );
        this.activeCycleSubject.next(activeCycle);
      }),
      catchError(err => {
        const msg = err.message ?? 'Failed to load Linear issues';
        this.errorSubject.next(msg);
        this.loadingSubject.next(false);
        return of([]);
      })
    );
  }

  /**
   * Fetch the active cycle (cycle whose date window contains today) across all
   * teams the viewer belongs to.  Picks the first active cycle found.
   */
  fetchActiveCycle(): Observable<LinearCycle | null> {
    if (!this.apiKey) return of(null);

    const query = `
      query ActiveCycle {
        viewer {
          teams {
            nodes {
              activeCycle {
                id
                name
                number
                startsAt
                endsAt
                progress
                team { name }
              }
            }
          }
        }
      }
    `;

    return this.gql<{ viewer: { teams: { nodes: { activeCycle: LinearCycle | null }[] } } }>(query).pipe(
      map(d => {
        const cycles = d.viewer.teams.nodes
          .map(t => t.activeCycle)
          .filter((c): c is LinearCycle => c !== null);
        return cycles[0] ?? null;
      }),
      tap(cycle => {
        // Only overwrite the subject if we actually found a cycle;
        // a null result from the team API should not clear a cycle derived from issues.
        if (cycle !== null) {
          this.activeCycleSubject.next(cycle);
        }
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Lightweight cycle refresh: re-derives the active cycle from the cycle fields
   * on assigned issues without touching loadingSubject or issuesSubject.
   * Safe to call from background timers shared with other widgets.
   */
  silentlyRefreshCycle(): Observable<LinearCycle | null> {
    if (!this.apiKey) return of(null);

    const query = `
      query SilentCycleRefresh {
        viewer {
          assignedIssues(
            filter: { state: { type: { nin: ["completed", "cancelled"] } } }
          ) {
            nodes {
              cycle { id name number startsAt endsAt progress team { name } }
            }
          }
        }
      }
    `;

    return this.gql<{ viewer: { assignedIssues: { nodes: { cycle: LinearIssue['cycle'] }[] } } }>(query).pipe(
      map(d => {
        const today = new Date();
        const seen = new Map<string, NonNullable<LinearIssue['cycle']>>();
        for (const node of d.viewer.assignedIssues.nodes) {
          const c = node.cycle;
          if (c && !seen.has(c.id) && new Date(c.startsAt) <= today && new Date(c.endsAt) >= today) {
            seen.set(c.id, c);
          }
        }
        const activeCycles = [...seen.values()];
        return activeCycles.length === 0 ? null
          : activeCycles.reduce((best, c) =>
              new Date(c.startsAt) < new Date(best.startsAt) ? c : best
            );
      }),
      tap(cycle => this.activeCycleSubject.next(cycle)),
      catchError(() => of(this.activeCycleSubject.value))
    );
  }

  /**
   * Fetch the current viewer's saved custom views.
   */
  fetchCustomViews(): Observable<LinearCustomView[]> {
    if (!this.apiKey) return of([]);

    const query = `
      query CustomViews {
        customViews {
          nodes {
            id
            name
            description
          }
        }
      }
    `;

    return this.gql<{ customViews: { nodes: LinearCustomView[] } }>(query).pipe(
      map(d => d.customViews.nodes),
      catchError(err => { throw err; })
    );
  }

  /**
   * Fetch all issues belonging to a saved custom view.
   */
  fetchViewIssues(viewId: string): Observable<{ name: string; issues: LinearIssue[] }> {
    if (!this.apiKey) return of({ name: '', issues: [] });

    const query = `
      query ViewIssues($id: String!) {
        customView(id: $id) {
          id
          name
          issues {
            nodes {
              id
              identifier
              title
              description
              priority
              url
              updatedAt
              dueDate
              estimate
              state { name color type }
              team { name }
              labels { nodes { name color } }
              project { name }
              cycle { id name number startsAt endsAt progress team { name } }
            }
          }
        }
      }
    `;

    return this.gql<{ customView: { id: string; name: string; issues: { nodes: LinearIssue[] } } }>(
      query,
      { id: viewId }
    ).pipe(
      map(d => ({ name: d.customView.name, issues: d.customView.issues.nodes })),
      catchError(err => { throw err; })
    );
  }
}
