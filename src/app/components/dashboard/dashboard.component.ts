import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SprintCalendarComponent } from './sprint-calendar/sprint-calendar.component';
import { OpenArenaChatComponent } from './open-arena-chat/open-arena-chat.component';
import { NewsTickerWidgetComponent } from './news-ticker-widget/news-ticker-widget.component';
import { AdoWorkItemsComponent } from './ado-work-items/ado-work-items.component';
import { GitHubAiChatComponent } from './github-ai-chat/github-ai-chat.component';
import { CoworkerTimezonesComponent } from './coworker-timezones/coworker-timezones.component';
import { AiPrioritySummaryComponent } from './ai-priority-summary/ai-priority-summary.component';
import { TaskTrackerComponent } from './task-tracker/task-tracker.component';
import { OutlookCalendarComponent } from './outlook-calendar/outlook-calendar.component';
import { TimekeepingComponent } from './timekeeping/timekeeping.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    SprintCalendarComponent,
    OpenArenaChatComponent,
    NewsTickerWidgetComponent,
    AdoWorkItemsComponent,
    GitHubAiChatComponent,
    CoworkerTimezonesComponent,
    AiPrioritySummaryComponent,
    TaskTrackerComponent,
    OutlookCalendarComponent,
    TimekeepingComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentTime = new Date();
  private timeInterval?: number;
  
  // Sliding drawer state
  isChatDrawerOpen = false;
  
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
  
  toggleChatDrawer() {
    this.isChatDrawerOpen = !this.isChatDrawerOpen;
  }
}