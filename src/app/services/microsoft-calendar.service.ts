import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface CalendarEvent {
  id: string;
  subject: string;
  isAllDay?: boolean;
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

  /** Emits the expiry Date when a token is saved, or null when cleared. */
  private tokenExpirySubject = new BehaviorSubject<Date | null>(null);
  public tokenExpiry$ = this.tokenExpirySubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  /** Extract the exp claim from a JWT without verifying the signature. */
  private parseExpiry(token: string): Date | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded.exp ? new Date(decoded.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  initialize(accessToken: string) {
    this.accessToken = accessToken;
    this.configuredSubject.next(true);
    this.tokenExpirySubject.next(this.parseExpiry(accessToken));
    this.saveConfiguration();
    localStorage.setItem('ms-graph-ever-connected', 'true');
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

    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$orderby=start/dateTime&$select=id,subject,start,end,location,organizer,attendees,isOnlineMeeting,onlineMeeting,showAs,isAllDay`;

    return this.http.get<any>(url, { headers }).pipe(
          map(response => {
        const allEvents = response.value as CalendarEvent[];
        // Filter out all-day events whose start date doesn't match the requested date.
        // Graph returns all-day events spanning into the next day (end = next midnight)
        // which would otherwise bleed into the following day's query.
        const ymd = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const requestedYmd = ymd(date);
        const events = allEvents.filter(e => {
          if (!e.isAllDay) return true;
          // All-day event datetimes use date strings like "2026-04-21T00:00:00.0000000".
          // Graph uses a half-open interval [start, end) where end is the *next* day
          // for single-day events. Show the event on every day it spans.
          const startDate = e.start.dateTime.substring(0, 10);
          const endDate   = e.end.dateTime.substring(0, 10); // exclusive
          return startDate <= requestedYmd && requestedYmd < endDate;
        });
        this.eventsSubject.next(events);
        this.loadingSubject.next(false);
        return events;
      }),
      catchError(error => {
        console.error('Failed to fetch calendar events:', error);
        if (error.status === 401) {
          this.clearConfiguration();
          this.errorSubject.next('Token expired. Please paste a new token in Connections → Outlook Calendar.');
        } else if (error.status === 403) {
          this.errorSubject.next('403: Token is missing the Calendars.Read permission. In Graph Explorer, go to Modify Permissions, consent to Calendars.Read, then copy a fresh token.');
        } else {
          const status = error.status ? `HTTP ${error.status}` : 'Network error';
          const detail = error.error?.message || error.error?.error?.message || error.message || 'Unknown error';
          this.errorSubject.next(`${status}: ${detail}`);
        }
        this.loadingSubject.next(false);
        return of([]);
      })
    );
  }

  /**
   * Check if the user is signed in to Microsoft
   */
  isConfigured(): boolean {
    return this.configuredSubject.value;
  }

  private saveConfiguration() {
    if (this.accessToken) {
      localStorage.setItem('outlook-calendar-token', this.accessToken);
    }
  }

  private loadConfiguration() {
    const token = localStorage.getItem('outlook-calendar-token');
    if (token) {
      this.accessToken = token;
      this.configuredSubject.next(true);
      this.tokenExpirySubject.next(this.parseExpiry(token));
    }
  }

  clearConfiguration() {
    this.accessToken = '';
    this.configuredSubject.next(false);
    this.tokenExpirySubject.next(null);
    localStorage.removeItem('outlook-calendar-token');
    this.eventsSubject.next([]);
  }
}
