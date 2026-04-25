import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { LinearService, LinearIssue } from '../../../services/linear.service';
import { NavigationService } from '../../../services/navigation.service';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-linear-work-items',
  standalone: true,
  imports: [CommonModule],
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

  menuOpen = false;
  itemsHidden = false;
  showCompleted = localStorage.getItem('linear-show-completed') === 'true';

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  toggleItemVisibility(): void {
    this.itemsHidden = !this.itemsHidden;
    this.closeMenu();
  }

  toggleShowCompleted(): void {
    this.showCompleted = !this.showCompleted;
    localStorage.setItem('linear-show-completed', String(this.showCompleted));
    this.closeMenu();
    this.loadIssues();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.actions-menu-container')) {
      this.menuOpen = false;
    }
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
    if (name.toLowerCase().includes('review')) return 'fa-circle-half-stroke';
    return null;
  }

  getStateIconColor(type: string, name: string, fallback: string): string {
    if (name.toLowerCase().includes('review')) return '#43bc58';
    return fallback;
  }
}
