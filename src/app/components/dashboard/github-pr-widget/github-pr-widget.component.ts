import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GitHubPrService, GitHubPullRequest, PrFilter, DiagnosticInfo } from '../../../services/github-pr.service';

@Component({
  selector: 'app-github-pr-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './github-pr-widget.component.html',
  styleUrl: './github-pr-widget.component.scss'
})
export class GithubPrWidgetComponent implements OnInit, OnDestroy {
  prs: GitHubPullRequest[] = [];
  loading = false;
  error: string | null = null;
  connected = false;

  activeFilter: PrFilter = 'all';
  expandedPrId: number | null = null;
  diagnostic: DiagnosticInfo | null = null;
  showDiagnostics = false;

  orgInput = '';
  activeOrg = '';
  repoInput = '';
  activeRepo = '';

  private destroy$ = new Subject<void>();

  constructor(private prService: GitHubPrService) {}

  ngOnInit(): void {
    this.prService.connected$.pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.connected = c;
      if (c) {
        // Delay slightly so the auto-resolve username call can complete first
        // when the widget loads immediately after the token is saved.
        setTimeout(() => this.refresh(), 500);
      }
    });

    this.prService.prs$.pipe(takeUntil(this.destroy$)).subscribe(prs => (this.prs = prs));
    this.prService.loading$.pipe(takeUntil(this.destroy$)).subscribe(l => (this.loading = l));
    this.prService.error$.pipe(takeUntil(this.destroy$)).subscribe(e => (this.error = e));
    this.prService.diagnostic$.pipe(takeUntil(this.destroy$)).subscribe(d => (this.diagnostic = d));

    // Restore saved org
    this.activeOrg = this.prService.getOrg();
    this.orgInput = this.activeOrg;

    // Restore saved repo
    this.activeRepo = this.prService.getRepo();
    this.repoInput = this.activeRepo;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void {
    this.prService.fetchPullRequests(this.activeFilter).pipe(takeUntil(this.destroy$)).subscribe();
  }

  verifyToken(): void {
    this.prService.verifyToken();
  }

  setFilter(filter: PrFilter): void {
    this.activeFilter = filter;
    this.refresh();
  }

  applyOrg(): void {
    this.activeOrg = this.orgInput.trim();
    this.prService.setOrg(this.activeOrg);
    this.refresh();
  }

  clearOrg(): void {
    this.orgInput = '';
    this.activeOrg = '';
    this.prService.setOrg('');
    this.refresh();
  }

  applyRepo(): void {
    this.activeRepo = this.repoInput.trim();
    this.prService.setRepo(this.activeRepo);
  }

  clearRepo(): void {
    this.repoInput = '';
    this.activeRepo = '';
    this.prService.setRepo('');
  }

  toggleExpand(prId: number): void {
    this.expandedPrId = this.expandedPrId === prId ? null : prId;
  }

  get openCount(): number {
    return this.prs.filter(p => p.state === 'open' && !p.draft).length;
  }

  get draftCount(): number {
    return this.prs.filter(p => p.draft).length;
  }

  prAge(createdAt: string): string {
    const diffMs = Date.now() - new Date(createdAt).getTime();
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  labelStyle(color: string): { [key: string]: string } {
    return {
      'background-color': `#${color}33`,
      'border-color': `#${color}`,
      'color': `#${color}`
    };
  }
}
