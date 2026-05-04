import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GitHubAIService } from '../../services/github-ai.service';
import { GitHubPrService, DiagnosticInfo } from '../../services/github-pr.service';
import { MicrosoftCalendarService } from '../../services/microsoft-calendar.service';
import { MicrosoftMailService } from '../../services/microsoft-mail.service';
import { MicrosoftTeamsService } from '../../services/microsoft-teams.service';
import { LinearService } from '../../services/linear.service';

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './connections.component.html',
  styleUrl: './connections.component.scss'
})
export class ConnectionsComponent implements OnInit, OnDestroy {
  // GitHub AI
  githubToken = '';
  githubModel = 'gpt-4o';
  githubModels: string[] = [];
  githubConnected = false;
  githubSaved = false;
  githubCallsUsed = 0;

  // Outlook Calendar
  calendarToken = '';
  calendarConnected = false;
  calendarSaved = false;
  calendarTokenExpiry: Date | null = null;

  // Outlook Mail
  mailToken = '';
  mailConnected = false;
  mailSaved = false;
  mailTokenExpiry: Date | null = null;

  // Microsoft Teams
  teamsToken = '';
  teamsConnected = false;
  teamsSaved = false;

  // GitHub Pull Requests
  githubPrToken = '';
  githubPrVerifiedUsername: string | null = null;
  githubPrConnected = false;
  githubPrSaved = false;

  private destroy$ = new Subject<void>();

  // Azure DevOps (status-only — full config lives in the ADO widget)
  adoConnected = false;
  adoProjects: { organization: string; project: string }[] = [];
  adoWidgetVisible = true;

  // Linear
  linearApiKey = '';
  linearConnected = false;
  linearSaved = false;
  linearViewerName: string | null = null;

  // Collapsible cards
  expandedCards = new Set<string>();

  toggleCard(id: string): void {
    if (this.expandedCards.has(id)) {
      this.expandedCards.delete(id);
    } else {
      this.expandedCards.add(id);
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedCards.has(id);
  }

  constructor(
    private aiService: GitHubAIService,
    private githubPrService: GitHubPrService,
    private calendarService: MicrosoftCalendarService,
    private mailService: MicrosoftMailService,
    private teamsService: MicrosoftTeamsService,
    private linearService: LinearService
  ) {}

  ngOnInit(): void {
    this.loadStatuses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadStatuses(): void {
    // GitHub AI
    this.githubToken = localStorage.getItem('github-ai-token') || '';
    this.githubModel = localStorage.getItem('github-ai-model') || 'gpt-4o';
    this.githubConnected = !!this.githubToken;
    this.githubModels = this.aiService.getAvailableModels();
    this.aiService.rateLimit$.subscribe(info => (this.githubCallsUsed = info.callsUsed));

    // Outlook Calendar
    this.calendarToken = localStorage.getItem('outlook-calendar-token') || '';
    this.calendarConnected = !!this.calendarToken;
    this.calendarService.tokenExpiry$.pipe(takeUntil(this.destroy$)).subscribe(exp => {
      this.calendarTokenExpiry = exp;
    });

    // Outlook Mail
    this.mailToken = localStorage.getItem('outlook-mail-token') || '';
    this.mailConnected = !!this.mailToken;
    this.mailService.tokenExpiry$.pipe(takeUntil(this.destroy$)).subscribe(exp => {
      this.mailTokenExpiry = exp;
    });

    // Microsoft Teams
    this.teamsToken = localStorage.getItem('ms-teams-token') || '';
    this.teamsConnected = !!this.teamsToken;

    // GitHub Pull Requests
    this.githubPrToken = localStorage.getItem('github-pr-token') || '';
    this.githubPrConnected = this.githubPrService.isConfigured();
    this.githubPrService.verifiedUsername$.pipe(takeUntil(this.destroy$)).subscribe(u => {
      this.githubPrVerifiedUsername = u;
    });
    this.githubPrActiveOrg = this.githubPrService.getOrg();
    this.githubPrOrgInput = this.githubPrActiveOrg;
    this.githubPrActiveRepo = this.githubPrService.getRepo();
    this.githubPrRepoInput = this.githubPrActiveRepo;
    this.githubPrService.diagnostic$.pipe(takeUntil(this.destroy$)).subscribe(d => {
      this.githubPrDiagnostic = d;
    });

    // Azure DevOps
    try {
      const raw = localStorage.getItem('ado-projects');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.adoProjects = parsed.map((p: any) => ({ organization: p.organization, project: p.project }));
        this.adoConnected = this.adoProjects.length > 0;
      }
    } catch {
      this.adoProjects = [];
    }
    this.adoWidgetVisible = localStorage.getItem('ado-widget-visible') !== 'false';

    // Linear
    this.linearApiKey = localStorage.getItem('linear-api-key') || '';
    this.linearConnected = this.linearService.isConfigured();
    this.linearService.viewer$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      this.linearViewerName = v?.name ?? null;
    });
    if (this.linearConnected) {
      this.linearService.fetchViewer().subscribe();
    }
  }

  // GitHub AI
  saveGitHub(): void {
    const token = this.githubToken.trim();
    if (!token) return;
    this.aiService.initialize(token, this.githubModel);
    this.githubConnected = true;
    this.githubSaved = true;
    setTimeout(() => (this.githubSaved = false), 3000);
  }

  disconnectGitHub(): void {
    this.aiService.clearConfiguration();
    this.githubToken = '';
    this.githubConnected = false;
  }

  resetApiCounter(): void {
    if (confirm('Reset GitHub AI call counter to 0?')) {
      this.aiService.resetRateLimitInfo();
    }
  }

  // Token expiry helpers used by the template
  now(): number { return Date.now(); }
  minutesUntil(expiry: Date): number { return Math.max(0, Math.round((expiry.getTime() - Date.now()) / 60000)); }

  // Outlook Calendar
  saveCalendar(): void {
    const token = this.calendarToken.trim();
    if (!token) return;
    this.calendarService.initialize(token);
    this.calendarConnected = true;
    this.calendarSaved = true;
    setTimeout(() => (this.calendarSaved = false), 3000);
  }

  disconnectCalendar(): void {
    this.calendarService.clearConfiguration();
    this.calendarToken = '';
    this.calendarConnected = false;
    this.calendarTokenExpiry = null;
  }

  // Outlook Mail
  saveMail(): void {
    const token = this.mailToken.trim();
    if (!token) return;
    this.mailService.initialize(token);
    this.mailConnected = true;
    this.mailSaved = true;
    setTimeout(() => (this.mailSaved = false), 3000);
  }

  disconnectMail(): void {
    this.mailService.clearConfiguration();
    this.mailToken = '';
    this.mailConnected = false;
    this.mailTokenExpiry = null;
  }

  // Microsoft Teams
  saveTeams(): void {
    const token = this.teamsToken.trim();
    if (!token) return;
    this.teamsService.setAccessToken(token);
    this.teamsConnected = true;
    this.teamsSaved = true;
    setTimeout(() => (this.teamsSaved = false), 3000);
  }

  disconnectTeams(): void {
    this.teamsService.clearAccessToken();
    this.teamsToken = '';
    this.teamsConnected = false;
  }

  // GitHub Pull Requests
  githubPrOrgInput = '';
  githubPrActiveOrg = '';
  githubPrRepoInput = '';
  githubPrActiveRepo = '';
  githubPrShowDiagnostics = false;
  githubPrDiagnostic: DiagnosticInfo | null = null;

  saveGitHubPr(): void {
    const token = this.githubPrToken.trim();
    if (!token) return;
    this.githubPrService.initialize(token);
    this.githubPrConnected = true;
    this.githubPrSaved = true;
    setTimeout(() => (this.githubPrSaved = false), 3000);
  }

  disconnectGitHubPr(): void {
    this.githubPrService.clearConfiguration();
    this.githubPrToken = '';
    this.githubPrVerifiedUsername = null;
    this.githubPrConnected = false;
  }

  applyPrOrg(): void {
    this.githubPrActiveOrg = this.githubPrOrgInput.trim();
    this.githubPrService.setOrg(this.githubPrActiveOrg);
  }

  clearPrOrg(): void {
    this.githubPrOrgInput = '';
    this.githubPrActiveOrg = '';
    this.githubPrService.setOrg('');
  }

  applyPrRepo(): void {
    this.githubPrActiveRepo = this.githubPrRepoInput.trim();
    this.githubPrService.setRepo(this.githubPrActiveRepo);
  }

  clearPrRepo(): void {
    this.githubPrRepoInput = '';
    this.githubPrActiveRepo = '';
    this.githubPrService.setRepo('');
  }

  verifyPrToken(): void {
    this.githubPrService.verifyToken();
  }

  // ADO widget visibility
  toggleAdoWidget(): void {
    this.adoWidgetVisible = !this.adoWidgetVisible;
    localStorage.setItem('ado-widget-visible', String(this.adoWidgetVisible));
  }

  // Linear
  saveLinear(): void {
    const key = this.linearApiKey.trim();
    if (!key) return;
    this.linearService.initialize(key);
    this.linearConnected = true;
    this.linearSaved = true;
    this.linearService.fetchViewer().subscribe();
    setTimeout(() => (this.linearSaved = false), 3000);
  }

  disconnectLinear(): void {
    this.linearService.clearConfiguration();
    this.linearApiKey = '';
    this.linearConnected = false;
    this.linearViewerName = null;
  }
}
