import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { GitHubAIService, ChatMessage } from '../../../services/github-ai.service';
import { JournalService, JournalEntry } from '../../../services/journal.service';
import { TaskService, Task } from '../../../services/task.service';
import { GoalsService, Goal } from '../../../services/goals.service';
import { AdoService } from '../../../services/ado.service';
import { CoworkerService } from '../../../services/coworker.service';
import { MicrosoftCalendarService, CalendarEvent } from '../../../services/microsoft-calendar.service';
import { LinearService, LinearIssue, LinearCustomView } from '../../../services/linear.service';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { TouchTooltipDirective } from '../../../directives/touch-tooltip.directive';

export interface Skill {
  id: string;
  label: string;
  icon: string;
  description: string;
  loading: boolean;
}

@Component({
  selector: 'app-ai-ask-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, TouchTooltipDirective],
  templateUrl: './ai-ask-widget.component.html',
  styleUrls: ['./ai-ask-widget.component.scss']
})
export class AiAskWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  @ViewChild('skillsDropdownWrapper') private skillsDropdownWrapper!: ElementRef;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showSkillsDropdown && this.skillsDropdownWrapper &&
        !this.skillsDropdownWrapper.nativeElement.contains(event.target)) {
      this.showSkillsDropdown = false;
    }
  }

  // Freeform ask
  question = '';
  loading = false;
  error: string | null = null;
  isConfigured = false;
  conversationHistory: ChatMessage[] = [];
  conversationExpanded = false;
  confirmClear = false;
  private shouldScroll = false;
  showSkillsDropdown = false;
  skillsDropdownUp = false;

  // Tracks assistant messages currently playing the reveal animation
  animatingMessages = new Set<ChatMessage>();

  replayAnimation(msg: ChatMessage): void {
    this.animatingMessages.delete(msg);
    // Allow Angular to remove the class first, then re-add on next frame
    requestAnimationFrame(() => {
      this.animatingMessages.add(msg);
      setTimeout(() => this.animatingMessages.delete(msg), 750);
    });
  }

  // Skills
  skills: Skill[] = [
    { id: 'daily-summary', label: 'Daily Summary',  icon: 'fas fa-wand-sparkles',        description: 'Motivational overview + top priorities for today', loading: false },
    { id: 'scrum-update',  label: 'Scrum Update',   icon: 'fas fa-users',                description: 'Standup update drafted from journal entries',   loading: false },
    { id: 'sprint-retro',  label: 'Sprint Retro',   icon: 'fas fa-chart-bar',            description: 'Retro board suggestions based on your sprint activity', loading: false },
    { id: 'branch-name',   label: 'Branch Name',    icon: 'fas fa-code-branch',          description: 'Generate a git branch name from a Linear issue', loading: false },
    { id: 'view-triage',   label: 'Issue Suggestions', icon: 'fas fa-magnifying-glass-chart', description: 'Recommend issues from a Linear view that fit your engineering profile', loading: false },
  ];

  // Branch name skill state
  showBranchPicker = false;
  branchIssues: LinearIssue[] = [];
  private linearIssues: LinearIssue[] = [];

  // View browser panel state
  showViewBrowser = false;
  viewBrowserViews: LinearCustomView[] = [];
  viewBrowserViewsLoading = false;
  viewBrowserViewsError: string | null = null;
  selectedView: LinearCustomView | null = null;
  viewBrowserIssues: LinearIssue[] = [];
  viewBrowserIssuesLoading = false;
  viewBrowserIssuesError: string | null = null;

  // Live data
  private journalEntries: JournalEntry[] = [];
  private tasks: Task[] = [];
  private goals: Goal[] = [];
  private calendarEvents: CalendarEvent[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private elRef: ElementRef,
    private aiService: GitHubAIService,
    private auth: Auth,
    private journalService: JournalService,
    private taskService: TaskService,
    private goalsService: GoalsService,
    private calendarService: MicrosoftCalendarService,
    private adoService: AdoService,
    private coworkerService: CoworkerService,
    private linearService: LinearService
  ) {}

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get firstName(): string {
    const name = this.auth.currentUser?.displayName ?? '';
    return name.split(' ')[0] || 'there';
  }

  ngOnInit(): void {
    this.isConfigured = this.aiService.isConfigured();
    this.loadChatHistory();

    this.journalService.entries$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => (this.journalEntries = entries));

    combineLatest([this.taskService.tasks$])
      .pipe(debounceTime(200), takeUntil(this.destroy$))
      .subscribe(([tasks]) => (this.tasks = tasks));

    this.goalsService.goals$
      .pipe(takeUntil(this.destroy$))
      .subscribe(goals => (this.goals = goals));

    this.calendarService.weekEvents$
      .pipe(takeUntil(this.destroy$))
      .subscribe(events => (this.calendarEvents = events));

    // Fetch a 2-week window (past 7 days + next 7 days) for AI context
    this.calendarService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        if (configured) this.fetchCalendarRange();
      });

    this.linearService.issues$
      .pipe(takeUntil(this.destroy$))
      .subscribe(issues => {
        this.linearIssues = issues;
      });

    this.aiService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => (this.isConfigured = this.aiService.isConfigured()));
  }

  toggleConversationExpanded(): void {
    // Anchor to the bottom of the viewport: record how far the viewport top is
    // from the document bottom, then restore that distance after reflow.
    // When the conversation expands upward, the document grows and this
    // compensates by scrolling down the same amount, keeping visible content stable.
    const distanceFromBottom = document.documentElement.scrollHeight - window.scrollY;
    this.conversationExpanded = !this.conversationExpanded;
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight - distanceFromBottom, behavior: 'instant' });
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.chatContainer) {
      if (!this.conversationExpanded) {
        const el = this.chatContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.ask();
    }
  }

  clearConversation(): void {
    this.conversationHistory = [];
    this.error = null;
    this.question = '';
    this.confirmClear = false;
    this.saveChatHistory();
  }

  copiedMsgIndex: number | null = null;

  copyMessage(content: string, index: number): void {
    navigator.clipboard.writeText(content).then(() => {
      this.copiedMsgIndex = index;
      setTimeout(() => { this.copiedMsgIndex = null; }, 1500);
    });
  }

  // ── Freeform ask ──────────────────────────────────────────────

  ask(): void {
    const q = this.question.trim();
    if (!q || this.loading || this.anySkillLoading) return;
    this.question = '';
    this.sendMessage(q);
  }

  // ── Skills ────────────────────────────────────────────────────

  runSkill(skillId: string): void {
    if (this.loading || this.anySkillLoading) return;

    if (skillId === 'branch-name') {
      const activeStates = ['backlog', 'unstarted', 'started'];
      this.branchIssues = this.linearIssues.filter(i => activeStates.includes(i.state.type));
      this.showBranchPicker = true;
      this.showSkillsDropdown = false;
      this.shouldScroll = true;
      return;
    }

    if (skillId === 'view-triage') {
      this.showSkillsDropdown = false;
      this.openViewBrowser();
      return;
    }

    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;

    let prompt: string;
    if (skillId === 'daily-summary') {
      prompt = this.buildDailySummaryPrompt();
    } else if (skillId === 'scrum-update') {
      prompt = this.buildScrumPrompt();
    } else {
      prompt = this.buildSprintRetroPrompt();
    }

    if (!prompt) return;

    skill.loading = true;
    this.error = null;
    this.sendMessage(prompt, skill);
  }

  toggleSkillsDropdown(): void {
    if (this.showSkillsDropdown) {
      this.showSkillsDropdown = false;
      return;
    }
    if (this.skillsDropdownWrapper) {
      const rect = this.skillsDropdownWrapper.nativeElement.getBoundingClientRect();
      const estimatedHeight = 260; // approx dropdown height in px
      this.skillsDropdownUp = rect.bottom + estimatedHeight > window.innerHeight;
    }
    this.showSkillsDropdown = true;
  }

  get anySkillLoading(): boolean {
    return this.skills.some(s => s.loading);
  }

  // ── Core send ─────────────────────────────────────────────────

  private sendMessage(
    userText: string,
    skill?: Skill,
    options?: { systemPrompt?: string; skipHistory?: boolean }
  ): void {
    this.error = null;
    if (!skill) this.loading = true;

    const systemMsg: ChatMessage = {
      role: 'system',
      content: options?.systemPrompt ?? this.buildSystemContext(),
      timestamp: new Date()
    };

    const userMsg: ChatMessage = {
      role: 'user',
      content: userText,
      timestamp: new Date(),
      ...(skill ? { skillLabel: skill.label, skillDescription: skill.description, skillPrompt: userText } : {})
    };
    const priorHistory = options?.skipHistory ? [] : this.conversationHistory;
    const historyForApi = [systemMsg, ...priorHistory, userMsg];

    // Show user turn immediately
    this.conversationHistory = [...this.conversationHistory, userMsg];
    this.shouldScroll = true;

    this.aiService.sendMessage(userText, historyForApi)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const assistantMsg: ChatMessage = { role: 'assistant', content: response, timestamp: new Date() };
          this.conversationHistory = [...this.conversationHistory, assistantMsg];
          this.loading = false;
          if (skill) skill.loading = false;
          this.shouldScroll = true;
          this.saveChatHistory();
          // Trigger reveal animation, then clear after it completes
          this.animatingMessages.add(assistantMsg);
          setTimeout(() => this.animatingMessages.delete(assistantMsg), 750);
        },
        error: (err) => {
          // Remove the optimistically-added user message
          this.conversationHistory = this.conversationHistory.slice(0, -1);
          this.error = err.message || 'Failed to get a response. Please try again.';
          this.loading = false;
          if (skill) skill.loading = false;
        }
      });
  }

  private fetchCalendarRange(): void {
    const start = new Date();
    start.setDate(start.getDate() - 14);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    end.setHours(23, 59, 59, 999);
    this.calendarService.getEventsForRange(start, end)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  // ── Context builders ──────────────────────────────────────────

  private buildSystemContext(): string {
    const now = new Date();
    const lines: string[] = [
      `You are a helpful AI assistant integrated into a personal work dashboard.`,
      `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
      `Answer questions about the user's tasks, journal entries, and ADO work items concisely. Use light markdown where helpful.`,
      ``
    ];

    // Journal
    if (this.journalEntries.length > 0) {
      lines.push(`## Journal Entries (${this.journalEntries.length} total, most recent first)`);
      this.journalEntries.slice(0, 15).forEach(e => {
        const d = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const t = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        lines.push(`- [${d} ${t}] ${e.text}`);
      });
      lines.push('');
    }

    // Tasks
    const pending = this.tasks.filter(t => !t.completed);
    const completed = this.tasks.filter(t => t.completed);
    if (this.tasks.length > 0) {
      lines.push(`## Tasks (${pending.length} pending, ${completed.length} done)`);
      pending.slice(0, 15).forEach(t => {
        let line = `- [PENDING] ${t.title}`;
        if (t.priority) line += ` [${t.priority}]`;
        if (t.dueDate) {
          const due = new Date(t.dueDate);
          line += due < now ? ` (OVERDUE: ${due.toLocaleDateString()})` : ` (due ${due.toLocaleDateString()})`;
        }
        lines.push(line);
      });
      completed.slice(0, 5).forEach(t => lines.push(`- [DONE] ${t.title}`));
      lines.push('');
    }

    // Calendar events
    if (this.calendarEvents.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const past = this.calendarEvents.filter(e => new Date(e.start.dateTime) < today);
      const upcoming = this.calendarEvents.filter(e => new Date(e.start.dateTime) >= today);

      const formatEvent = (e: CalendarEvent): string => {
        const start = new Date(e.start.dateTime);
        const end   = new Date(e.end.dateTime);
        const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      + '–' + end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        let line = `- ${dateStr} ${timeStr}: ${e.subject}`;
        if (e.location?.displayName) line += ` @ ${e.location.displayName}`;
        if (e.isOnlineMeeting) line += ' [Online]';
        if (e.showAs === 'free') line += ' [Free]';
        return line;
      };

      lines.push(`## Outlook Calendar (past 7 days + next 7 days, ${this.calendarEvents.length} event${this.calendarEvents.length !== 1 ? 's' : ''})`);
      if (past.length > 0) {
        lines.push(`### Past`);
        past.forEach(e => lines.push(formatEvent(e)));
      }
      if (upcoming.length > 0) {
        lines.push(`### Upcoming`);
        upcoming.forEach(e => lines.push(formatEvent(e)));
      }
      lines.push('');
    }

    // Yearly goals
    if (this.goals.length > 0) {
      const currentYear = now.getFullYear();
      const byYear: Record<number, Goal[]> = {};
      this.goals.forEach(g => {
        if (!byYear[g.year]) byYear[g.year] = [];
        byYear[g.year].push(g);
      });
      const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
      lines.push(`## Yearly Goals`);
      years.forEach(yr => {
        lines.push(`### ${yr}${yr === currentYear ? ' (current year)' : ''}`);
        byYear[yr].forEach((g, i) => {
          lines.push(`${i + 1}. ${g.title}${g.description ? ` — ${g.description}` : ''}`);
        });
      });
      lines.push('');
    }

    // ADO work items
    const adoItems: any[] = (this.adoService as any)['workItemsSubject']?.value ?? [];
    if (adoItems.length > 0) {
      const org = this.adoService.getOrganization();
      const proj = this.adoService.getProject();
      lines.push(`## Azure DevOps Work Items (${adoItems.length} total)`);
      adoItems.slice(0, 15).forEach((item: any) => {
        const id = item.fields['System.Id'] || item.id;
        const title = item.fields['System.Title'];
        const state = item.fields['System.State'];
        const type = item.fields['System.WorkItemType'];
        const priority = item.fields['Microsoft.VSTS.Common.Priority'];
        const pi = (item as any).projectInfo ?? (org && proj ? { organization: org, project: proj } : null);
        if (pi) {
          const url = `https://dev.azure.com/${pi.organization}/${encodeURIComponent(pi.project)}/_workitems/edit/${id}`;
          lines.push(`- [${type} ${id}: ${title}](${url}) [${state}]${priority ? ` P${priority}` : ''}`);
        } else {
          lines.push(`- ${type} ${id}: ${title} [${state}]${priority ? ` P${priority}` : ''}`);
        }
      });
      lines.push('');
    }

    // Coworkers
    const coworkers: any[] = (this.coworkerService as any)['coworkersSubject']?.value ?? [];
    if (coworkers.length > 0) {
      const inHours = coworkers.filter(c => {
        if (!c.timezone) return false;
        const h = new Date(new Date().toLocaleString('en-US', { timeZone: c.timezone })).getHours();
        return h >= 9 && h < 17;
      }).length;
      lines.push(`## Team: ${inHours}/${coworkers.length} coworkers currently in office hours`);
    }

    return lines.join('\n');
  }

  pickBranchIssue(issue: LinearIssue): void {
    this.showBranchPicker = false;
    const skill = this.skills.find(s => s.id === 'branch-name')!;
    skill.loading = true;
    this.error = null;
    this.sendMessage(this.buildBranchNamePrompt(issue), skill);
  }

  cancelBranchPicker(): void {
    this.showBranchPicker = false;
    this.shouldScroll = true;
  }

  openViewBrowser(): void {
    if (!this.linearService.isConfigured()) {
      this.error = 'Connect Linear first to use Issue Suggestions.';
      return;
    }
    this.showViewBrowser = true;
    if (this.viewBrowserViews.length === 0) {
      this.viewBrowserViewsLoading = true;
      this.viewBrowserViewsError = null;
      this.linearService.fetchCustomViews().subscribe({
        next: views => {
          this.viewBrowserViews = views;
          this.viewBrowserViewsLoading = false;
        },
        error: (err) => {
          this.viewBrowserViewsError = err.message ?? 'Failed to load Linear views';
          this.viewBrowserViewsLoading = false;
        }
      });
    }
  }

  selectView(view: LinearCustomView): void {
    this.selectedView = view;
    this.viewBrowserIssues = [];
    this.viewBrowserIssuesLoading = true;
    this.viewBrowserIssuesError = null;
    this.linearService.fetchViewIssues(view.id).subscribe({
      next: ({ issues }) => {
        this.viewBrowserIssues = issues;
        this.viewBrowserIssuesLoading = false;
      },
      error: (err) => {
        this.viewBrowserIssuesError = err.message ?? 'Failed to load view issues';
        this.viewBrowserIssuesLoading = false;
      }
    });
  }

  clearSelectedView(): void {
    this.selectedView = null;
    this.viewBrowserIssues = [];
    this.viewBrowserIssuesError = null;
  }

  closeViewBrowser(): void {
    this.showViewBrowser = false;
    this.selectedView = null;
    this.viewBrowserIssues = [];
    this.viewBrowserIssuesError = null;
  }

  suggestPicks(): void {
    if (!this.selectedView || this.viewBrowserIssues.length === 0 || this.anySkillLoading) return;
    const skill = this.skills.find(s => s.id === 'view-triage')!;
    skill.loading = true;
    this.error = null;
    const now = new Date();
    const systemPrompt = `You are a helpful AI assistant helping an engineer choose the best Linear issues to pick up next. Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Be concise and use markdown.`;
    this.sendMessage(this.buildViewTriagePrompt(), skill, { systemPrompt, skipHistory: true });
  }

  private buildViewTriagePrompt(): string {
    const viewName = this.selectedView?.name ?? 'Selected View';
    const viewIssues = this.viewBrowserIssues;
    const MAX_VIEW_ISSUES = 50;
    const MAX_PROFILE_ISSUES = 10;
    const truncated = viewIssues.length > MAX_VIEW_ISSUES;
    const displayIssues = truncated ? viewIssues.slice(0, MAX_VIEW_ISSUES) : viewIssues;
    const priorities = ['', 'Urgent', 'High', 'Medium', 'Low'];

    const lines: string[] = [
      `Recommend 3–5 issues from the Linear view "${viewName}" that best match my engineering profile.`
    ];

    if (this.linearIssues.length > 0) {
      lines.push(`\n## My Profile (current assignments)`);
      this.linearIssues.slice(0, MAX_PROFILE_ISSUES).forEach(i => {
        const tags = [
          i.project?.name,
          ...i.labels.nodes.map(l => l.name)
        ].filter(Boolean).join(', ');
        lines.push(`- ${i.identifier}: ${i.title}${tags ? ` [${tags}]` : ''}`);
      });
    }

    lines.push(`\n## View: "${viewName}" (${viewIssues.length} issues${truncated ? `, showing first ${MAX_VIEW_ISSUES}` : ''})`);
    displayIssues.forEach(i => {
      const tags = [
        i.project?.name,
        ...i.labels.nodes.map(l => l.name)
      ].filter(Boolean).join(', ');
      const prio = i.priority > 0 && i.priority < priorities.length ? priorities[i.priority] : '';
      const est = i.estimate != null ? `${i.estimate}pt` : '';
      const meta = [prio, est, i.state.name].filter(Boolean).join(' | ');
      lines.push(`- [${i.identifier}](${i.url}): ${i.title}${tags ? ` [${tags}]` : ''}${meta ? ` (${meta})` : ''}`);
    });

    lines.push(`\nRespond with a numbered list. For each of your 3–5 picks: link the issue identifier (e.g. [LIN-123](url)), give a 1-sentence skill-match reason, and note any complexity or risk. Order best-fit first.`);

    return lines.join('\n');
  }

  private buildBranchNamePrompt(issue: LinearIssue): string {
    const desc = issue.description ? `\n\nDescription:\n${issue.description.slice(0, 600)}` : '';
    return `Generate a git branch name for the following Linear issue using this exact format:

{prefix}/LIN#{number}-{3-to-6-word-kebab-summary}

Rules:
- prefix: use "fix" if the issue is a bug/fix/error, otherwise use "feature"
- number: the digits from the identifier (e.g. LIN-228 → 228)
- summary: 3–6 significant lowercase words from the title, kebab-cased, stop-words removed (a, an, the, and, or, for, to, of, in, on, at, with, by, from)

Examples:
- feature/LIN#228-add-new-tooltips-for-navigation
- fix/LIN#301-broken-login-redirect

Issue:
Identifier: ${issue.identifier}
Title: ${issue.title}
State: ${issue.state.name}${desc}

Respond with only the branch name on a single line, nothing else.`;
  }

  private buildSprintRetroPrompt(): string {
    const hasData = this.journalEntries.length > 0 || this.calendarEvents.length > 0 || this.tasks.length > 0;
    if (!hasData) {
      this.error = 'No sprint data found — add some journal entries or tasks first!';
      return '';
    }
    return `Based on my activity over the past sprint (roughly the last 2 weeks), generate concise retro board suggestions for each of the following 5 categories. For each category, provide 2-3 brief bullet points (1 sentence each). Draw from my journal entries, completed tasks, calendar meetings, ADO work items, and any coworker interactions.

    Format the response exactly like this (use these exact category headings):

    ## What went well?
    - ...

    ## What did we learn?
    - ...

    ## Shout-outs! (who was helpful to me)
    - ...

    ## What didn't go well?
    - ...

    ## Focus for improvement
    - ...

    Keep each bullet point brief and suitable for a shared team retro board. If there is not enough data for a category, still include it with a note like "Not enough data to suggest items — consider adding journal entries."`;
  }

  private buildDailySummaryPrompt(): string {
    return `Give me a motivational daily briefing based on my dashboard data. Start with a casual, energizing greeting (use some bro-speak). Then provide:
1. A 1-2 sentence overview of my day
2. My top 3-5 priorities to focus on
3. A one-line callout if any of today's tasks connect to my yearly goals

When referencing ADO work items, make them clickable markdown links. Keep it concise and actionable. Respond in plain markdown (no JSON).`;
  }

  private buildScrumPrompt(): string {
    if (this.journalEntries.length === 0) {
      this.error = 'No journal entries found — add some first!';
      return '';
    }
    return `Based on my recent journal entries, write a brief scrum standup update (3-5 sentences, flowing prose, no bullet points) covering what I've been working on, any progress, and any blockers. Make it natural and ready to read aloud. Just the update text, nothing else.`;
  }

  // ── Rendering ─────────────────────────────────────────────────

  formatMessage(text: string): string {
    // Markdown links → HTML <a>
    let out = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bold
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headings
    out = out.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    out = out.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    out = out.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // List items → wrap in <ul>
    out = out.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });
    // Paragraphs
    out = out.replace(/\n{2,}/g, '</p><p>');
    out = out.replace(/\n/g, '<br>');
    return `<p>${out}</p>`;
  }

  formatTimestamp(date: Date): string {
    return new Date(date)
      .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      .replace(/AM$/, 'am')
      .replace(/PM$/, 'pm');
  }

  // ── Persistence ───────────────────────────────────────────────

  private saveChatHistory(): void {
    try {
      localStorage.setItem('ai-ask-chat-history', JSON.stringify(this.conversationHistory.slice(-40)));
    } catch { /* storage full */ }
  }

  private loadChatHistory(): void {
    try {
      const saved = localStorage.getItem('ai-ask-chat-history');
      if (saved) this.conversationHistory = JSON.parse(saved);
    } catch { this.conversationHistory = []; }
  }
}
