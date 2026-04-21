import { Component, OnInit, OnDestroy, ElementRef, HostListener } from '@angular/core';
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
  showErrorDetail = false;

  private destroy$ = new Subject<void>();

  constructor(private calendarService: MicrosoftCalendarService, private navigationService: NavigationService, private elRef: ElementRef) {}

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
      .subscribe(events => { this.events = events; this._rowCache = null; });

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

  /**
   * Parse an MS Graph datetime string safely on all browsers, including iOS Safari.
   *
   * Two problems with raw Graph strings:
   * 1. With `Prefer: outlook.timezone`, Graph returns up to 7 fractional-second digits
   *    (e.g. "2026-04-20T09:00:00.0000000") — beyond the 3-digit ISO 8601 spec.
   *    iOS Safari's JavaScriptCore rejects this with Invalid Date.
   * 2. The same strings have NO timezone designator (no Z, no offset). The ECMAScript
   *    spec leaves timezone-naive datetime strings implementation-defined; iOS Safari
   *    treats them as UTC while desktop browsers treat them as local time — causing
   *    events to appear shifted by the UTC offset on iPhone.
   *
   * Fix: truncate to 3 fractional digits, then append the device's explicit UTC offset
   * so every browser interprets the local time correctly.
   */
  private parseDateTime(dateTimeStr: string): Date {
    // Step 1: truncate fractional seconds to at most 3 digits.
    let s = dateTimeStr.replace(/(\.(\d{3}))\d+/, '$1');
    // Step 2: if there is no timezone designator, append the local UTC offset.
    // Strings that already end with Z or ±HH:MM are left unchanged.
    if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
      const offsetMin = -new Date().getTimezoneOffset(); // positive = ahead of UTC
      const sign = offsetMin >= 0 ? '+' : '-';
      const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
      const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
      s += `${sign}${hh}:${mm}`;
    }
    return new Date(s);
  }

  formatTime(dateTimeString: string, timeZone?: string): string {
    const date = this.parseDateTime(dateTimeString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  isEventHappening(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const start = this.parseDateTime(event.start.dateTime);
    const end = this.parseDateTime(event.end.dateTime);
    return now >= start && now <= end;
  }

  isEventUpcoming(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const start = this.parseDateTime(event.start.dateTime);
    return start > now;
  }

  isEventPast(event: CalendarEvent): boolean {
    const now = this.currentTime;
    const end = this.parseDateTime(event.end.dateTime);
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
    const start = this.parseDateTime(event.start.dateTime);
    const end = this.parseDateTime(event.end.dateTime);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const left = (startMinutes / (24 * 60)) * 100;
    const width = Math.max(((endMinutes - startMinutes) / (24 * 60)) * 100, 0.5);
    return { left, width };
  }

  /**
   * Assign each event to a row (0 = top, 1 = bottom) so overlapping events
   * don't stack on top of each other. Uses a greedy interval approach.
   * Returns a Map keyed by event id → row index.
   */
  private _rowCache: { events: CalendarEvent[]; map: Map<string, number> } | null = null;

  getEventRows(): Map<string, number> {
    if (this._rowCache && this._rowCache.events === this.events) {
      return this._rowCache.map;
    }
    const sorted = [...this.events].sort((a, b) =>
      this.parseDateTime(a.start.dateTime).getTime() - this.parseDateTime(b.start.dateTime).getTime()
    );
    const rowEnd: number[] = []; // tracks the end-minute of the last event on each row
    const map = new Map<string, number>();
    for (const ev of sorted) {
      const start = this.parseDateTime(ev.start.dateTime);
      const end   = this.parseDateTime(ev.end.dateTime);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin   = end.getHours()   * 60 + end.getMinutes();
      let assigned = -1;
      for (let r = 0; r < rowEnd.length; r++) {
        if (rowEnd[r] <= startMin) { assigned = r; break; }
      }
      if (assigned === -1) { assigned = rowEnd.length; }
      rowEnd[assigned] = endMin;
      map.set(ev.id, assigned);
    }
    this._rowCache = { events: this.events, map };
    return map;
  }

  /** True when any two events overlap (i.e. need more than one row). */
  get hasOverlappingEvents(): boolean {
    return this.getEventRows().size > 0 && Math.max(...Array.from(this.getEventRows().values())) > 0;
  }

  getEventRow(event: CalendarEvent): number {
    return this.getEventRows().get(event.id) ?? 0;
  }

  isEventNearRightEdge(event: CalendarEvent): boolean {
    return this.getEventHorizontalPosition(event).left > 60;
  }

  // Kept for backwards compat (unused in new template)
  getTimeMarkers(): string[] {
    return this.getHourArray().map(h => this.getHourLabel(h));
  }

  getEventDuration(event: CalendarEvent): string {
    const start = this.parseDateTime(event.start.dateTime);
    const end = this.parseDateTime(event.end.dateTime);
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

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: HTMLElement): void {
    if (this.selectedEvent && !this.elRef.nativeElement.contains(target)) {
      this.selectedEvent = null;
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
      .filter(e => this.parseDateTime(e.start.dateTime) > now)
      .sort((a, b) => this.parseDateTime(a.start.dateTime).getTime() - this.parseDateTime(b.start.dateTime).getTime());
    return upcoming[0] ?? null;
  }

  getCountdownToNextEvent(): string | null {
    if (!this.isToday()) return null;
    const next = this.getNextEvent();
    if (!next) return null;
    const diffMs = this.parseDateTime(next.start.dateTime).getTime() - this.currentTime.getTime();
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
