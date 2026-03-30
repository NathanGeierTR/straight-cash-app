import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LoginComponent } from './components/login/login.component';
import { ConnectionsComponent } from './components/connections/connections.component';
import { JournalComponent } from './components/journal/journal.component';
import { OpenArenaChatComponent } from './components/dashboard/open-arena-chat/open-arena-chat.component';
import { GitHubAIService, RateLimitInfo } from './services/github-ai.service';
import { AuthService } from './services/auth.service';
import { Subscription } from 'rxjs';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DashboardComponent, LoginComponent, ConnectionsComponent, JournalComponent, OpenArenaChatComponent, CommonModule],
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
  currentView: 'dashboard' | 'connections' | 'journal' | 'open-arena-chat' = 'dashboard';
  touchTooltipLabel: string | null = null;
  touchTooltipX = 0;
  touchTooltipY = 0;
  touchTooltipTransform = 'translateX(-50%)';
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions = new Subscription();

  constructor(public githubAIService: GitHubAIService, private authService: AuthService) {}

  ngOnInit() {
    // Track auth state
    this.subscriptions.add(
      this.authService.user$.subscribe(user => {
        this.currentUser = user;
        this.authLoaded = true;
      })
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

  navigateTo(view: 'dashboard' | 'connections' | 'journal' | 'open-arena-chat') {
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

  onNavTouchStart(event: TouchEvent, label: string, align: 'above' | 'bottom-right' | 'bottom-left' = 'above') {
    const touch = event.touches[0];
    this.longPressTimer = setTimeout(() => {
      this.touchTooltipLabel = label;
      if (align === 'bottom-right') {
        this.touchTooltipX = touch.clientX;
        this.touchTooltipY = touch.clientY + 20;
        this.touchTooltipTransform = 'none';
      } else if (align === 'bottom-left') {
        this.touchTooltipX = touch.clientX;
        this.touchTooltipY = touch.clientY + 20;
        this.touchTooltipTransform = 'translateX(-100%)';
      } else {
        this.touchTooltipX = touch.clientX;
        this.touchTooltipY = touch.clientY - 44;
        this.touchTooltipTransform = 'translateX(-50%)';
      }
    }, 400);
  }

  onNavTouchEnd() {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.touchTooltipLabel = null;
  }

  @HostListener('document:touchend')
  @HostListener('document:touchcancel')
  clearTouchTooltip() {
    this.touchTooltipLabel = null;
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
