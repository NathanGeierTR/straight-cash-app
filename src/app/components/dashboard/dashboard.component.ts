import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SprintCalendarComponent } from './sprint-calendar/sprint-calendar.component';
import { NewsTickerWidgetComponent } from './news-ticker-widget/news-ticker-widget.component';
import { AdoWorkItemsComponent } from './ado-work-items/ado-work-items.component';
import { GitHubAiChatComponent } from './github-ai-chat/github-ai-chat.component';
import { CoworkerTimezonesComponent } from './coworker-timezones/coworker-timezones.component';
import { OutlookCalendarComponent } from './outlook-calendar/outlook-calendar.component';
import { OutlookMailComponent } from './outlook-mail/outlook-mail.component';
import { TeamsChatWidgetComponent } from './teams-chat-widget/teams-chat-widget.component';
import { TimekeepingComponent } from './timekeeping/timekeeping.component';
import { GithubPrWidgetComponent } from './github-pr-widget/github-pr-widget.component';
import { AiAskWidgetComponent } from './ai-ask-widget/ai-ask-widget.component';
import { LinearWorkItemsComponent } from './linear-work-items/linear-work-items.component';
import { SlackWidgetComponent } from './slack-widget/slack-widget.component';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    SprintCalendarComponent,
    NewsTickerWidgetComponent,
    AdoWorkItemsComponent,
    GitHubAiChatComponent,
    CoworkerTimezonesComponent,
    OutlookCalendarComponent,
    OutlookMailComponent,
    TeamsChatWidgetComponent,
    TimekeepingComponent,
    AiAskWidgetComponent,
    LinearWorkItemsComponent,
    SlackWidgetComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentTime = new Date();
  showAdoWidget = true;
  showLinearWidget = true;
  showMailWidget = true;
  showTeamsWidget = true;
  showSlackWidget = true;
  private timeInterval?: number;

  constructor(private navigationService: NavigationService) {}

  ngOnInit() {
    this.showAdoWidget = localStorage.getItem('ado-widget-visible') !== 'false';
    this.showLinearWidget = localStorage.getItem('linear-widget-visible') !== 'false';
    this.showMailWidget = localStorage.getItem('mail-widget-visible') !== 'false';
    this.showTeamsWidget = localStorage.getItem('teams-widget-visible') !== 'false';
    this.showSlackWidget = localStorage.getItem('slack-widget-visible') !== 'false';
    this.timeInterval = window.setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }

  openJournalEntry(): void {
    this.navigationService.navigateToNewJournalEntry();
  }

  openTasks(): void {
    this.navigationService.navigateTo('tasks');
  }
}