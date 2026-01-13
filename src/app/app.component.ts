import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { GitHubAIService, RateLimitInfo } from './services/github-ai.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DashboardComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  isAIConnected = false;
  rateLimit: RateLimitInfo | null = null;
  showSetupPrompt = false;
  private subscriptions = new Subscription();

  constructor(public githubAIService: GitHubAIService) {}

  ngOnInit() {
    // Subscribe to AI service configuration status
    this.isAIConnected = this.githubAIService.isConfigured();
    
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
}
