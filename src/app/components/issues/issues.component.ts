import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { LinearService, LinearIssue, LinearCustomView } from '../../services/linear.service';
import { GitHubAIService } from '../../services/github-ai.service';
import { NavigationService } from '../../services/navigation.service';
import { UserProfileService } from '../../services/user-profile.service';
import { TouchTooltipDirective } from '../../directives/touch-tooltip.directive';

type IssuesTab = 'assigned' | 'view';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-issues',
  standalone: true,
  imports: [CommonModule, FormsModule, TouchTooltipDirective],
  templateUrl: './issues.component.html',
  styleUrl: './issues.component.scss',
})
export class IssuesComponent implements OnInit, OnDestroy, AfterViewChecked {
  // ── State ──────────────────────────────────────────────────

  isConfigured = false;
  activeTab: IssuesTab = 'assigned';

  // Assigned
  assignedIssues: LinearIssue[] = [];
  assignedLoading = false;
  assignedError: string | null = null;
  showCompleted = localStorage.getItem('linear-issues-show-completed') === 'true';

  // View browser
  customViews: LinearCustomView[] = [];
  viewsLoading = false;
  viewsError: string | null = null;
  selectedView: LinearCustomView | null = null;
  viewIssues: LinearIssue[] = [];
  viewIssuesLoading = false;
  viewIssuesError: string | null = null;
  viewSelectorOpen = false;

  private readonly FAVORITES_KEY = 'linear-favorited-views';
  favoritedViewIds = new Set<string>(JSON.parse(localStorage.getItem('linear-favorited-views') ?? '[]'));

  // Shared issue display
  expandedIssues = new Set<string>();
  filterText = '';

  // AI query
  aiQuery = '';
  aiLoading = false;
  messages: ChatMessage[] = [];
  aiError: string | null = null;
  isAIConfigured = false;
  conversationExpanded = false;

  @ViewChild('aiMessagesContainer') private messagesContainer?: ElementRef<HTMLElement>;
  private shouldScrollMessages = false;

  private destroy$ = new Subject<void>();

  constructor(
    private linearService: LinearService,
    private aiService: GitHubAIService,
    private navigationService: NavigationService,
    private userProfileService: UserProfileService,
    private sanitizer: DomSanitizer,
  ) {}

  ngAfterViewChecked(): void {
    if (this.shouldScrollMessages) {
      this.scrollToBottom();
      this.shouldScrollMessages = false;
    }
  }

  ngOnInit(): void {
    this.isConfigured = this.linearService.isConfigured();
    this.isAIConfigured = this.aiService.isConfigured();

    this.linearService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        this.isConfigured = configured;
        if (configured) this.loadAssigned();
      });

    this.linearService.issues$
      .pipe(takeUntil(this.destroy$))
      .subscribe(issues => (this.assignedIssues = issues));

    this.linearService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => (this.assignedLoading = loading));

    this.linearService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(err => (this.assignedError = err));

    this.aiService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => (this.isAIConfigured = this.aiService.isConfigured()));

    if (this.isConfigured) {
      this.loadAssigned();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Tab navigation ─────────────────────────────────────────

  switchTab(tab: IssuesTab): void {
    this.activeTab = tab;
    this.filterText = '';
    this.messages = [];
    this.aiError = null;
    if (tab === 'view' && this.customViews.length === 0 && !this.viewsLoading) {
      this.loadViews();
    }
  }

  // ── Assigned ───────────────────────────────────────────────

  loadAssigned(): void {
    this.linearService.fetchMyIssues(this.showCompleted).subscribe();
  }

  toggleShowCompleted(): void {
    this.showCompleted = !this.showCompleted;
    localStorage.setItem('linear-issues-show-completed', String(this.showCompleted));
    this.loadAssigned();
  }

  get filteredAssigned(): LinearIssue[] {
    return this.sortIssues(this.assignedIssues).filter(i => this.matchesFilter(i));
  }

  // ── Views ──────────────────────────────────────────────────

  loadViews(): void {
    this.viewsLoading = true;
    this.viewsError = null;
    this.linearService.fetchCustomViews().subscribe({
      next: views => {
        this.customViews = views;
        this.viewsLoading = false;
      },
      error: err => {
        this.viewsError = err.message ?? 'Failed to load views';
        this.viewsLoading = false;
      },
    });
  }

  selectView(view: LinearCustomView): void {
    this.selectedView = view;
    this.viewSelectorOpen = false;
    this.viewIssues = [];
    this.viewIssuesLoading = true;
    this.viewIssuesError = null;
    this.filterText = '';
    this.messages = [];
    this.aiError = null;
    this.linearService.fetchViewIssues(view.id).subscribe({
      next: ({ issues }) => {
        this.viewIssues = issues;
        this.viewIssuesLoading = false;
      },
      error: err => {
        this.viewIssuesError = err.message ?? 'Failed to load view issues';
        this.viewIssuesLoading = false;
      },
    });
  }

  get filteredViewIssues(): LinearIssue[] {
    return this.sortIssues(this.viewIssues).filter(i => this.matchesFilter(i));
  }

  get favoritedViews(): LinearCustomView[] {
    return this.customViews.filter(v => this.favoritedViewIds.has(v.id));
  }

  isFavorited(view: LinearCustomView): boolean {
    return this.favoritedViewIds.has(view.id);
  }

  toggleFavorite(view: LinearCustomView, event: Event): void {
    event.stopPropagation();
    if (this.favoritedViewIds.has(view.id)) {
      this.favoritedViewIds.delete(view.id);
    } else {
      this.favoritedViewIds.add(view.id);
    }
    localStorage.setItem(this.FAVORITES_KEY, JSON.stringify([...this.favoritedViewIds]));
  }

  toggleViewSelector(): void {
    this.viewSelectorOpen = !this.viewSelectorOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.view-selector-container')) {
      this.viewSelectorOpen = false;
    }
  }

  // ── Shared issue display helpers ───────────────────────────

  get activeIssues(): LinearIssue[] {
    return this.activeTab === 'assigned' ? this.filteredAssigned : this.filteredViewIssues;
  }

  get activeCount(): number {
    const source = this.activeTab === 'assigned' ? this.assignedIssues : this.viewIssues;
    return source.length;
  }

  private matchesFilter(issue: LinearIssue): boolean {
    if (!this.filterText.trim()) return true;
    const q = this.filterText.toLowerCase();
    return (
      issue.title.toLowerCase().includes(q) ||
      issue.identifier.toLowerCase().includes(q) ||
      (issue.project?.name ?? '').toLowerCase().includes(q) ||
      issue.labels.nodes.some(l => l.name.toLowerCase().includes(q))
    );
  }

  private sortIssues(issues: LinearIssue[]): LinearIssue[] {
    return [...issues].sort((a, b) => {
      const nameA = a.state.name.toLowerCase();
      const nameB = b.state.name.toLowerCase();
      const rankA = Object.entries(this.stateOrder).find(([k]) => nameA.includes(k))?.[1] ?? 99;
      const rankB = Object.entries(this.stateOrder).find(([k]) => nameB.includes(k))?.[1] ?? 99;
      return rankA - rankB;
    });
  }

  private readonly stateOrder: Record<string, number> = {
    backlog: 0, todo: 1, 'in progress': 2, 'in review': 3,
    'in testing': 4, done: 5, cancelled: 6, duplicate: 7, triage: 8,
  };

  toggleIssue(id: string): void {
    this.expandedIssues.has(id) ? this.expandedIssues.delete(id) : this.expandedIssues.add(id);
  }

  isExpanded(id: string): boolean { return this.expandedIssues.has(id); }

  renderDescription(md: string | null): SafeHtml {
    if (!md?.trim()) return this.sanitizer.sanitize(1, '') ?? '';
    return this.sanitizer.sanitize(1, marked.parse(md, { async: false }) as string) ?? '';
  }

  getPriorityLabel(p: number): string {
    return ['None', 'Urgent', 'High', 'Medium', 'Low'][p] ?? 'None';
  }
  getPriorityClass(p: number): string {
    return ['priority-none', 'priority-urgent', 'priority-high', 'priority-medium', 'priority-low'][p] ?? 'priority-none';
  }
  getPriorityIcon(p: number): string {
    return ['fa-temperature-empty', 'fa-temperature-full', 'fa-temperature-three-quarters', 'fa-temperature-half', 'fa-temperature-quarter'][p] ?? 'fa-minus';
  }
  isOverdue(issue: LinearIssue): boolean {
    return !!issue.dueDate && new Date(issue.dueDate) < new Date();
  }
  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  getStateClass(type: string): string {
    const map: Record<string, string> = {
      started: 'state-started', unstarted: 'state-unstarted',
      backlog: 'state-backlog', completed: 'state-completed', cancelled: 'state-cancelled',
    };
    return map[type] ?? 'state-backlog';
  }
  getStateIcon(type: string, name: string): string | null {
    if (type === 'completed') return 'fa-circle-check';
    const n = name.toLowerCase();
    if (n.includes('backlog'))   return 'fa-bars-staggered';
    if (n.includes('todo'))      return 'fa-circle';
    if (n.includes('progress'))  return 'fa-person-running';
    if (n.includes('review'))    return 'fa-glasses';
    if (n.includes('testing'))   return 'fa-vial';
    if (n.includes('canceled') || n.includes('cancelled')) return 'fa-circle-xmark';
    if (n.includes('duplicate')) return 'fa-circle-xmark';
    if (n.includes('triage'))    return 'fa-arrows-left-right';
    return null;
  }
  getStateIconColor(type: string, name: string, fallback: string): string {
    const n = name.toLowerCase();
    if (n.includes('backlog'))   return '#a8a8a8';
    if (n.includes('todo'))      return '#a8a8a8';
    if (n.includes('progress'))  return '#f0bf00';
    if (n.includes('review'))    return '#43bc58';
    if (n.includes('testing'))   return '#4cb782';
    if (n.includes('canceled') || n.includes('cancelled')) return '#95a2b3';
    if (n.includes('duplicate')) return '#95a2b3';
    if (n.includes('triage'))    return '#ff7336';
    return fallback;
  }

  // ── AI query ───────────────────────────────────────────────

  onAIKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.runAIQuery();
    }
  }

  runAIQuery(): void {
    const q = this.aiQuery.trim();
    if (!q || this.aiLoading) return;

    const issues = this.activeIssues;
    if (issues.length === 0) {
      this.aiError = 'No issues loaded to query.';
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: q, timestamp: new Date() };
    this.messages = [...this.messages, userMessage];
    this.aiQuery = '';
    const ta = document.querySelector('.ai-textarea') as HTMLTextAreaElement | null;
    if (ta) { ta.style.height = '32px'; }
    this.aiLoading = true;
    this.aiError = null;
    this.shouldScrollMessages = true;

    const now = new Date();
    const jobDescription = this.userProfileService.jobDescription;
    const profileContext = jobDescription
      ? ` The engineer's role and skillset: ${jobDescription}.`
      : '';
    const systemPrompt = `You are a helpful AI assistant for an engineer's work dashboard. Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.${profileContext} Use this context to tailor your recommendations to their skills and focus areas. Answer concisely using markdown. When listing issues, always include the identifier and title as a markdown link to the issue URL.`;

    const priorities = ['', 'Urgent', 'High', 'Medium', 'Low'];
    const issueLines = issues.slice(0, 60).map(i => {
      const tags = [i.project?.name, ...i.labels.nodes.map(l => l.name)].filter(Boolean).join(', ');
      const prio = i.priority > 0 && i.priority < priorities.length ? priorities[i.priority] : '';
      const est = i.estimate != null ? `${i.estimate}pt` : '';
      const meta = [prio, est, i.state.name].filter(Boolean).join(' | ');
      return `- [${i.identifier}](${i.url}): ${i.title}${tags ? ` [${tags}]` : ''}${meta ? ` (${meta})` : ''}`;
    }).join('\n');

    const sourceName = this.activeTab === 'assigned' ? 'my assigned issues' : `the "${this.selectedView?.name}" view`;
    const userPrompt = `Here are ${sourceName} (${issues.length} total):\n\n${issueLines}\n\nQuestion: ${q}`;

    const apiMsgs = [
      { role: 'system' as const, content: systemPrompt, timestamp: new Date() },
      { role: 'user'   as const, content: userPrompt,   timestamp: new Date() },
    ];

    this.aiService.sendMessage(userPrompt, apiMsgs).pipe(takeUntil(this.destroy$)).subscribe({
      next: response => {
        const aiMsg: ChatMessage = { role: 'assistant', content: response, timestamp: new Date() };
        this.messages = [...this.messages, aiMsg];
        this.aiLoading = false;
        this.shouldScrollMessages = true;
      },
      error: err => {
        this.aiError = err.message ?? 'AI query failed.';
        this.aiLoading = false;
        this.shouldScrollMessages = true;
      },
    });
  }

  clearAI(): void {
    this.aiQuery = '';
    this.messages = [];
    this.aiError = null;
    this.conversationExpanded = false;
  }

  toggleConversationExpanded(): void {
    const distanceFromBottom = document.documentElement.scrollHeight - window.scrollY;
    this.conversationExpanded = !this.conversationExpanded;
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight - distanceFromBottom, behavior: 'instant' });
    });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    }
  }

  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  copyMessage(content: string): void {
    navigator.clipboard.writeText(content);
  }

  autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = '32px';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  formatAIResponse(text: string): string {
    let out = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    out = out.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    out = out.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    out = out.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });
    out = out.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });
    out = out.replace(/\n{2,}/g, '</p><p>');
    out = out.replace(/\n/g, '<br>');
    return `<p>${out}</p>`;
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }
}
