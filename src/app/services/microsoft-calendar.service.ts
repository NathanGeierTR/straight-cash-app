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

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  /**
   * Initialize with access token
   */
  initialize(accessToken: string) {
    this.accessToken = accessToken;
    this.saveConfiguration();
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

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const startDateTime = startOfDay.toISOString();
    const endDateTime = endOfDay.toISOString();

    // Get user's local timezone
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
        this.errorSubject.next(`Failed to load calendar: ${error.message || 'Unknown error'}`);
        this.loadingSubject.next(false);
        return of([]);
      })
    );
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.accessToken;
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
    }
  }

  /**
   * Clear configuration
   */
  clearConfiguration() {
    this.accessToken = '';
    localStorage.removeItem('outlook-calendar-token');
    this.eventsSubject.next([]);
  }
}
