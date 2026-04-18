import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitHubAIService, ChatMessage } from '../../../services/github-ai.service';
import { JournalService, JournalEntry } from '../../../services/journal.service';
import { TaskService, Task } from '../../../services/task.service';
import { GoalsService, Goal } from '../../../services/goals.service';
import { AdoService } from '../../../services/ado.service';
import { CoworkerService } from '../../../services/coworker.service';
import { MicrosoftCalendarService, CalendarEvent } from '../../../services/microsoft-calendar.service';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-ask-widget.component.html',
  styleUrls: ['./ai-ask-widget.component.scss']
})
export class AiAskWidgetComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  // Freeform ask
  question = '';
  loading = false;
  error: string | null = null;
  isConfigured = false;
  conversationHistory: ChatMessage[] = [];
  private shouldScroll = false;

  // Skills
  skills: Skill[] = [
    { id: 'daily-summary', label: 'Daily Summary',  icon: 'fas fa-wand-sparkles', description: 'Motivational overview + top priorities for today', loading: false },
    { id: 'scrum-update',  label: 'Scrum Update',   icon: 'fas fa-users',          description: 'Standup update drafted from journal entries',   loading: false },
  ];

  // Live data
  private journalEntries: JournalEntry[] = [];
  private tasks: Task[] = [];
  private goals: Goal[] = [];
  private calendarEvents: CalendarEvent[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private aiService: GitHubAIService,
    private journalService: JournalService,
    private taskService: TaskService,
    private goalsService: GoalsService,
    private calendarService: MicrosoftCalendarService,
    private adoService: AdoService,
    private coworkerService: CoworkerService
  ) {}

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

    this.aiService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => (this.isConfigured = this.aiService.isConfigured()));
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.chatContainer) {
      const el = this.chatContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
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
    this.saveChatHistory();
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

    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;

    const prompt = skillId === 'daily-summary'
      ? this.buildDailySummaryPrompt()
      : this.buildScrumPrompt();

    if (!prompt) return;

    skill.loading = true;
    this.error = null;
    this.sendMessage(prompt, skill);
  }

  get anySkillLoading(): boolean {
    return this.skills.some(s => s.loading);
  }

  // ── Core send ─────────────────────────────────────────────────

  private sendMessage(userText: string, skill?: Skill): void {
    this.error = null;
    if (!skill) this.loading = true;

    const systemMsg: ChatMessage = {
      role: 'system',
      content: this.buildSystemContext(),
      timestamp: new Date()
    };

    const userMsg: ChatMessage = { role: 'user', content: userText, timestamp: new Date() };
    const historyForApi = [systemMsg, ...this.conversationHistory, userMsg];

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
    return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
