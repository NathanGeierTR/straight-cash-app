import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface CalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  organizer?: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: string;
    };
  }>;
  isOnlineMeeting?: boolean;
  onlineMeeting?: {
    joinUrl: string;
  };
  body?: {
    contentType: string;
    content: string;
  };
  showAs?: string; // busy, free, tentative, etc.
}

@Injectable({
  providedIn: 'root'
})
export class MicrosoftCalendarService {
  private accessToken = '';
  private eventsSubject = new BehaviorSubject<CalendarEvent[]>([]);
  public events$ = this.eventsSubject.asObservable();

  private weekEventsSubject = new BehaviorSubject<CalendarEvent[]>([]);
  public weekEvents$ = this.weekEventsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private configuredSubject = new BehaviorSubject<boolean>(false);
  public isConfigured$ = this.configuredSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  /**
   * Initialize with access token
   */
  initialize(accessToken: string) {
    this.accessToken = accessToken;
    this.configuredSubject.next(true);
    this.saveConfiguration();
  }

  /**
   * Get calendar events for a date range (does not affect the day-view events$ subject)
   */
  getEventsForRange(start: Date, end: Date): Observable<CalendarEvent[]> {
    if (!this.accessToken) return of([]);

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': `outlook.timezone="${userTimeZone}"`
    });

    const startStr = start.toISOString();
    const endStr   = end.toISOString();
    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startStr}&endDateTime=${endStr}&$orderby=start/dateTime&$top=100`;

    return this.http.get<any>(url, { headers }).pipe(
      map(response => {
        const events = response.value as CalendarEvent[];
        this.weekEventsSubject.next(events);
        return events;
      }),
      catchError(error => {
        if (error.status === 401) {
          this.clearConfiguration();
        }
        return of([]);
      })
    );
  }

  /**
   * Get today's calendar events
   */
  getTodayEvents(): Observable<CalendarEvent[]> {
    return this.getEventsForDate(new Date());
  }

  /**
   * Get calendar events for a specific date
   */
  getEventsForDate(date: Date): Observable<CalendarEvent[]> {
    if (!this.accessToken) {
      this.errorSubject.next('No access token configured');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    // Build a UTC window that covers the entire local calendar day.
    // Using setHours(0,0,0,0) gives midnight local time; toISOString() converts
    // that to UTC — so the window is already correct for any timezone.
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const startDateTime = startOfDay.toISOString();
    const endDateTime = endOfDay.toISOString();

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': `outlook.timezone="${userTimeZone}"`
    });

    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$orderby=start/dateTime`;

    return this.http.get<any>(url, { headers }).pipe(
      map(response => {
        const events = response.value as CalendarEvent[];
        this.eventsSubject.next(events);
        this.loadingSubject.next(false);
        return events;
      }),
      catchError(error => {
        console.error('Failed to fetch calendar events:', error);
        if (error.status === 401) {
          this.clearConfiguration();
          this.errorSubject.next('Outlook Calendar token expired or invalid. Please reconnect.');
        } else {
          this.errorSubject.next(`Failed to load calendar: ${error.message || 'Unknown error'}`);
        }
        this.loadingSubject.next(false);
        return of([]);
      })
    );
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.configuredSubject.value;
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfiguration() {
    if (this.accessToken) {
      localStorage.setItem('outlook-calendar-token', this.accessToken);
    }
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfiguration() {
    const token = localStorage.getItem('outlook-calendar-token');
    if (token) {
      this.accessToken = token;
      this.configuredSubject.next(true);
    }
  }

  /**
   * Clear configuration
   */
  clearConfiguration() {
    this.accessToken = '';
    this.configuredSubject.next(false);
    localStorage.removeItem('outlook-calendar-token');
    this.eventsSubject.next([]);
  }
}
