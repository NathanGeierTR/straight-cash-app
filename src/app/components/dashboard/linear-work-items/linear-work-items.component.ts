import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { LinearService, LinearIssue } from '../../../services/linear.service';
import { NavigationService } from '../../../services/navigation.service';
import { TouchTooltipDirective } from '../../../directives/touch-tooltip.directive';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-linear-work-items',
  standalone: true,
  imports: [CommonModule, TouchTooltipDirective],
  templateUrl: './linear-work-items.component.html',
  styleUrl: './linear-work-items.component.scss'
})
export class LinearWorkItemsComponent implements OnInit, OnDestroy {
  issues: LinearIssue[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;
  viewerName: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private linearService: LinearService,
    private navigationService: NavigationService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.linearService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        const justConfigured = !this.isConfigured && configured;
        this.isConfigured = configured;
        if (justConfigured) {
          this.loadIssues();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.linearService.fetchMyIssues(this.showCompleted).subscribe());
        }
      });

    this.linearService.issues$
      .pipe(takeUntil(this.destroy$))
      .subscribe(issues => (this.issues = issues));

    this.linearService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => (this.loading = loading));

    this.linearService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => (this.error = error));

    this.linearService.viewer$
      .pipe(takeUntil(this.destroy$))
      .subscribe(v => (this.viewerName = v?.name ?? null));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadIssues(): void {
    this.linearService.fetchMyIssues(this.showCompleted).subscribe();
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }

  itemsHidden = false;
  showCompleted = localStorage.getItem('linear-show-completed') === 'true';

  toggleItemVisibility(): void {
    this.itemsHidden = !this.itemsHidden;
  }

  toggleShowCompleted(): void {
    this.showCompleted = !this.showCompleted;
    localStorage.setItem('linear-show-completed', String(this.showCompleted));
    this.loadIssues();
  }

  expandedIssues = new Set<string>();

  toggleIssue(id: string): void {
    if (this.expandedIssues.has(id)) {
      this.expandedIssues.delete(id);
    } else {
      this.expandedIssues.add(id);
    }
  }

  isIssueExpanded(id: string): boolean {
    return this.expandedIssues.has(id);
  }

  private readonly stateOrder: Record<string, number> = {
    backlog: 0,
    todo: 1,
    'in progress': 2,
    'in review': 3,
    'in testing': 4,
    done: 5,
    cancelled: 6,
    duplicate: 7,
    triage: 8,
  };

  get sortedIssues(): LinearIssue[] {
    return [...this.issues].sort((a, b) => {
      const nameA = a.state.name.toLowerCase();
      const nameB = b.state.name.toLowerCase();
      const rankA = Object.entries(this.stateOrder).find(([k]) => nameA.includes(k))?.[1] ?? 99;
      const rankB = Object.entries(this.stateOrder).find(([k]) => nameB.includes(k))?.[1] ?? 99;
      return rankA - rankB;
    });
  }

  openIssue(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  shortIdentifier(identifier: string): string {
    const idx = identifier.indexOf('-');
    return idx !== -1 ? identifier.slice(idx + 1) : identifier;
  }

  renderDescription(md: string | null): SafeHtml {
    if (!md?.trim()) return this.sanitizer.sanitize(1, '') ?? '';
    const html = marked.parse(md, { async: false }) as string;
    return this.sanitizer.sanitize(1, html) ?? '';
  }

  getPriorityLabel(priority: number): string {
    return ['None', 'Urgent', 'High', 'Medium', 'Low'][priority] ?? 'None';
  }

  getPriorityClass(priority: number): string {
    return ['priority-none', 'priority-urgent', 'priority-high', 'priority-medium', 'priority-low'][priority] ?? 'priority-none';
  }

  getPriorityIcon(priority: number): string {
    const icons = ['fa-temperature-empty', 'fa-temperature-full', 'fa-temperature-three-quarters', 'fa-temperature-half', 'fa-temperature-quarter'];
    return icons[priority] ?? 'fa-minus';
  }

  isOverdue(issue: LinearIssue): boolean {
    if (!issue.dueDate) return false;
    return new Date(issue.dueDate) < new Date();
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getStateClass(type: string): string {
    const map: Record<string, string> = {
      started: 'state-started',
      unstarted: 'state-unstarted',
      backlog: 'state-backlog',
      completed: 'state-completed',
      cancelled: 'state-cancelled',
    };
    return map[type] ?? 'state-backlog';
  }

  getStateIcon(type: string, name: string): string | null {
    if (type === 'completed') return 'fa-circle-check';
    if (name.toLowerCase().includes('backlog')) return 'fa-bars-staggered';
    if (name.toLowerCase().includes('todo')) return 'fa-circle';
    if (name.toLowerCase().includes('progress')) return 'fa-person-running';
    if (name.toLowerCase().includes('review')) return 'fa-glasses';
    if (name.toLowerCase().includes('testing')) return 'fa-vial';
    if (name.toLowerCase().includes('canceled')) return 'fa-circle-xmark';
    if (name.toLowerCase().includes('duplicate')) return 'fa-circle-xmark';
    if (name.toLowerCase().includes('triage')) return 'fa-arrows-left-right';
    return null;
  }

  getStateIconColor(type: string, name: string, fallback: string): string {
    if (name.toLowerCase().includes('backlog')) return '#a8a8a8';
    if (name.toLowerCase().includes('todo')) return '#a8a8a8';
    if (name.toLowerCase().includes('progress')) return '#f0bf00';
    if (name.toLowerCase().includes('review')) return '#43bc58';
    if (name.toLowerCase().includes('testing')) return '#4cb782';
    if (name.toLowerCase().includes('canceled')) return '#95a2b3';
    if (name.toLowerCase().includes('duplicate')) return '#95a2b3';
    if (name.toLowerCase().includes('triage')) return '#ff7336';
    return fallback;
  }
}
