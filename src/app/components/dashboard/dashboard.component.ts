import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SprintCalendarComponent } from './sprint-calendar/sprint-calendar.component';
import { NewsTickerWidgetComponent } from './news-ticker-widget/news-ticker-widget.component';
import { AdoWorkItemsComponent } from './ado-work-items/ado-work-items.component';
import { GitHubAiChatComponent } from './github-ai-chat/github-ai-chat.component';
import { CoworkerTimezonesComponent } from './coworker-timezones/coworker-timezones.component';
import { TaskTrackerComponent } from './task-tracker/task-tracker.component';
import { OutlookCalendarComponent } from './outlook-calendar/outlook-calendar.component';
import { TimekeepingComponent } from './timekeeping/timekeeping.component';
import { JournalWidgetComponent } from './journal-widget/journal-widget.component';
import { GithubPrWidgetComponent } from './github-pr-widget/github-pr-widget.component';
import { AiAskWidgetComponent } from './ai-ask-widget/ai-ask-widget.component';

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
    TaskTrackerComponent,
    OutlookCalendarComponent,
    TimekeepingComponent,
    JournalWidgetComponent,
    AiAskWidgetComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentTime = new Date();
  private timeInterval?: number;
  
  ngOnInit() {
    // Update time every second
    this.timeInterval = window.setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
  }
  
}