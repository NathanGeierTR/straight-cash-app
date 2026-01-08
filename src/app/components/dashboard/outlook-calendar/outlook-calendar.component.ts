import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MicrosoftCalendarService, CalendarEvent } from '../../../services/microsoft-calendar.service';
import { Subject, takeUntil, interval } from 'rxjs';

@Component({
  selector: 'app-outlook-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './outlook-calendar.component.html',
  styleUrl: './outlook-calendar.component.scss'
})
export class OutlookCalendarComponent implements OnInit, OnDestroy {
  events: CalendarEvent[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;
  showConfig = false;
  accessToken = '';
  currentTime = new Date();
  selectedEvent: CalendarEvent | null = null;
  selectedDate = new Date();

  private destroy$ = new Subject<void>();

  constructor(private calendarService: MicrosoftCalendarService) {}

  ngOnInit() {
    this.isConfigured = this.calendarService.isConfigured();

    // Subscribe to service observables
    this.calendarService.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe(events => this.events = events);

    this.calendarService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.loading = loading);

    this.calendarService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);

    // Load events if configured
    if (this.isConfigured) {
      this.loadEvents();

      // Refresh events every 5 minutes
      interval(5 * 60 * 1000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.loadEvents());
    }

    // Update current time every minute for time indicators
    interval(60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.currentTime = new Date());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadEvents() {
    this.calendarService.getEventsForDate(this.selectedDate).subscribe();
  }

  saveConfiguration() {
    if (this.accessToken.trim()) {
      this.calendarService.initialize(this.accessToken);
      this.isConfigured = true;
      this.showConfig = false;
      this.loadEvents();
    }
  }

  clearConfiguration() {
    this.calendarService.clearConfiguration();
    this.accessToken = '';
    this.isConfigured = false;
    this.events = [];
  }

  formatTime(dateTimeString: string, timeZone?: string): string {
    // Parse the datetime string - if it doesn't have timezone info, treat as UTC
    const date = new Date(dateTimeString);
    
    // Format in local timezone
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  isEventHappening(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    return now >= start && now <= end;
  }

  isEventUpcoming(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const start = new Date(event.start.dateTime);
    return start > now;
  }

  isEventPast(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const end = new Date(event.end.dateTime);
    return end < now;
  }

  getEventStatusClass(event: CalendarEvent): string {
    if (this.isEventHappening(event)) return 'happening-now';
    if (this.isEventPast(event)) return 'past';
    return 'upcoming';
  }

  getEventStatusIcon(event: CalendarEvent): string {
    if (this.isEventHappening(event)) return 'fas fa-circle-dot';
    if (this.isEventPast(event)) return 'fas fa-check-circle';
    return 'far fa-circle';
  }

  hasLocation(event: CalendarEvent): boolean {
    return !!(event.location?.displayName || event.onlineMeeting?.joinUrl);
  }

  getLocationText(event: CalendarEvent): string {
    if (event.isOnlineMeeting && event.onlineMeeting?.joinUrl) {
      return 'Teams Meeting';
    }
    return event.location?.displayName || '';
  }

  openTeamsMeeting(event: CalendarEvent) {
    if (event.onlineMeeting?.joinUrl) {
      window.open(event.onlineMeeting.joinUrl, '_blank');
    }
  }

  refresh() {
    this.loadEvents();
  }

  // Timeline-specific methods
  getTimeMarkers(): string[] {
    const markers: string[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      markers.push(`${displayHour}${period}`);
    }
    return markers;
  }

  getCurrentTimePosition(): number {
    const now = this.currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    // Calculate percentage of day elapsed (0-100%)
    const percentOfDay = ((hours * 60 + minutes) / (24 * 60)) * 100;
    return percentOfDay;
  }

  getEventPosition(event: CalendarEvent): { top: number; height: number } {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    
    const startHours = start.getHours();
    const startMinutes = start.getMinutes();
    const endHours = end.getHours();
    const endMinutes = end.getMinutes();
    
    // Calculate start position as percentage of day
    const startPercent = ((startHours * 60 + startMinutes) / (24 * 60)) * 100;
    
    // Calculate duration in minutes
    const durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    const heightPercent = (durationMinutes / (24 * 60)) * 100;
    
    return {
      top: startPercent,
      height: Math.max(heightPercent, 2) // Minimum 2% height for visibility
    };
  }

  getEventDuration(event: CalendarEvent): string {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    
    if (durationMinutes < 60) {
      return `${durationMinutes}m`;
    }
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  formatTimeRange(event: CalendarEvent): string {
    const startTime = this.formatTime(event.start.dateTime);
    const endTime = this.formatTime(event.end.dateTime);
    return `${startTime} - ${endTime}`;
  }

  toggleEventSelection(event: CalendarEvent, clickEvent: Event): void {
    clickEvent.stopPropagation();
    if (this.selectedEvent === event) {
      this.selectedEvent = null;
    } else {
      this.selectedEvent = event;
    }
  }

  closePopup(): void {
    this.selectedEvent = null;
  }

  isEventSelected(event: CalendarEvent): boolean {
    return this.selectedEvent === event;
  }

  previousDay(): void {
    this.selectedDate = new Date(this.selectedDate);
    this.selectedDate.setDate(this.selectedDate.getDate() - 1);
    this.selectedEvent = null;
    this.loadEvents();
  }

  nextDay(): void {
    this.selectedDate = new Date(this.selectedDate);
    this.selectedDate.setDate(this.selectedDate.getDate() + 1);
    this.selectedEvent = null;
    this.loadEvents();
  }

  goToToday(): void {
    this.selectedDate = new Date();
    this.selectedEvent = null;
    this.loadEvents();
  }

  isToday(): boolean {
    const today = new Date();
    return this.selectedDate.getFullYear() === today.getFullYear() &&
           this.selectedDate.getMonth() === today.getMonth() &&
           this.selectedDate.getDate() === today.getDate();
  }
}
