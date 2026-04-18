import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LoginComponent } from './components/login/login.component';
import { ConnectionsComponent } from './components/connections/connections.component';
import { JournalComponent } from './components/journal/journal.component';
import { GoalsComponent } from './components/goals/goals.component';
import { TasksComponent } from './components/tasks/tasks.component';
import { OpenArenaChatComponent } from './components/dashboard/open-arena-chat/open-arena-chat.component';
import { GitHubAIService, RateLimitInfo } from './services/github-ai.service';
import { AuthService } from './services/auth.service';
import { NavigationService, AppView } from './services/navigation.service';
import { ToastService } from './services/toast.service';
import { ToastComponent } from './components/toast/toast.component';
import { TouchTooltipDirective } from './directives/touch-tooltip.directive';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DashboardComponent, LoginComponent, ConnectionsComponent, JournalComponent, GoalsComponent, TasksComponent, OpenArenaChatComponent, CommonModule, ToastComponent, TouchTooltipDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  isAIConnected = false;
  hasTokenError = false;
  rateLimit: RateLimitInfo | null = null;
  showSetupPrompt = false;
  currentUser: User | null = null;
  authLoaded = false;
  currentView: 'dashboard' | 'connections' | 'journal' | 'goals' | 'tasks' | 'open-arena-chat' = 'dashboard';
  private subscriptions = new Subscription();

  constructor(
    public githubAIService: GitHubAIService,
    private authService: AuthService,
    private navigationService: NavigationService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Expose toast service on window for console testing
    (window as any)['toast'] = this.toastService;

    // Track auth state
    this.subscriptions.add(
      this.authService.user$.subscribe(user => {
        this.currentUser = user;
        this.authLoaded = true;
      })
    );

    // Handle navigation requests from child components
    this.subscriptions.add(
      this.navigationService.navigate$.subscribe(view => this.navigateTo(view))
    );

    // Subscribe to AI service configuration status
    this.isAIConnected = this.githubAIService.isConfigured();
    
    // Subscribe to error status to detect token issues
    this.subscriptions.add(
      this.githubAIService.error$.subscribe(error => {
        // Check if the error is token-related
        this.hasTokenError = !!(error && (
          error.includes('Invalid or expired GitHub Personal Access Token') || 
          error.includes('Access denied. Check your token permissions') ||
          error.includes('GitHub AI service not configured')
        ));
      })
    );
    
    // Subscribe to rate limit updates
    this.subscriptions.add(
      this.githubAIService.rateLimit$.subscribe(rateLimit => {
        this.rateLimit = rateLimit;
        console.log('App Component - Rate Limit Update:', {
          callsUsed: rateLimit.callsUsed,
          callsRemaining: rateLimit.callsRemaining,
          callsLimit: rateLimit.callsLimit,
          isExceeded: this.isRateLimitExceeded
        });
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  toggleSetupPrompt() {
    this.showSetupPrompt = !this.showSetupPrompt;
  }

  scrollToAIWidget() {
    this.showSetupPrompt = false;
    // Scroll to GitHub AI widget
    setTimeout(() => {
      const element = document.querySelector('.github-ai-chat');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  resetCallCount(event: Event) {
    event.stopPropagation(); // Prevent toggleSetupPrompt from firing
    this.githubAIService.resetRateLimitInfo();
  }

  logout() {
    this.authService.logout().subscribe();
  }

  navigateTo(view: AppView) {
    this.currentView = view;
    this.showSetupPrompt = false;
  }

  get isRateLimitExceeded(): boolean {
    if (!this.rateLimit) {
      return false;
    }
    // Check if callsRemaining is explicitly 0 (exceeded)
    // Note: null means we don't have rate limit info yet
    if (this.rateLimit.callsRemaining !== null && this.rateLimit.callsRemaining <= 0) {
      return true;
    }
    return false;
  }
  
  get isAIServiceValid(): boolean {
    // The AI service is considered valid if it's configured and doesn't have token errors
    return this.isAIConnected && !this.hasTokenError;
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  clearTouchTooltip() {}
}
