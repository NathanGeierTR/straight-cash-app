import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MicrosoftCalendarService, CalendarEvent } from '../../../services/microsoft-calendar.service';
import { NavigationService } from '../../../services/navigation.service';
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
  showTokenInput = false;
  accessToken = '';
  currentTime = new Date();
  selectedEvent: CalendarEvent | null = null;
  selectedDate = new Date();
  isMinimized = true;

  private destroy$ = new Subject<void>();

  constructor(private calendarService: MicrosoftCalendarService, private navigationService: NavigationService) {}

  ngOnInit() {
    // Subscribe to service observables
    this.calendarService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        const justBecameConfigured = !this.isConfigured && configured;
        this.isConfigured = configured;

        // Load events whenever the token becomes available (handles both the case
        // where the component initialises already-configured and the case where the
        // user saves the token on the Connections page while the widget is mounted).
        if (justBecameConfigured) {
          this.loadEvents();

          // Refresh events every 5 minutes
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadEvents());
        }
      });

    this.calendarService.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe(events => this.events = events);

    this.calendarService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.loading = loading);

    this.calendarService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);

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
    this.showTokenInput = false;
    this.events = [];
  }

  goToConnections() {
    this.navigationService.navigateTo('connections');
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

  // ─── Horizontal timeline helpers ───────────────────────────────────────────

  getHourArray(): number[] {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  getHourLabel(hour: number): string {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    return hour < 12 ? `${hour}a` : `${hour - 12}p`;
  }

  getCurrentTimePosition(): number {
    const now = this.currentTime;
    return ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100;
  }

  getEventHorizontalPosition(event: CalendarEvent): { left: number; width: number } {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const left = (startMinutes / (24 * 60)) * 100;
    const width = Math.max(((endMinutes - startMinutes) / (24 * 60)) * 100, 0.5);
    return { left, width };
  }

  isEventNearRightEdge(event: CalendarEvent): boolean {
    return this.getEventHorizontalPosition(event).left > 60;
  }

  // Kept for backwards compat (unused in new template)
  getTimeMarkers(): string[] {
    return this.getHourArray().map(h => this.getHourLabel(h));
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

  expand(): void {
    this.isMinimized = false;
  }

  minimize(): void {
    this.selectedEvent = null;
    this.isMinimized = true;
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

  getNextEvent(): CalendarEvent | null {
    const now = this.currentTime;
    const upcoming = this.events
      .filter(e => new Date(e.start.dateTime) > now)
      .sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
    return upcoming[0] ?? null;
  }

  getCountdownToNextEvent(): string | null {
    if (!this.isToday()) return null;
    const next = this.getNextEvent();
    if (!next) return null;
    const diffMs = new Date(next.start.dateTime).getTime() - this.currentTime.getTime();
    if (diffMs <= 0) return null;
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  }
}
