import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface MailMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  bodyPreview: string;
  hasAttachments: boolean;
  webLink: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MicrosoftMailService {
  private readonly STORAGE_KEY = 'outlook-mail-token';
  private accessToken = '';

  private messagesSubject = new BehaviorSubject<MailMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private configuredSubject = new BehaviorSubject<boolean>(false);
  public isConfigured$ = this.configuredSubject.asObservable();

  private tokenExpirySubject = new BehaviorSubject<Date | null>(null);
  public tokenExpiry$ = this.tokenExpirySubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfiguration();
  }

  private parseExpiry(token: string): Date | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded['exp'] ? new Date(decoded['exp'] * 1000) : null;
    } catch {
      return null;
    }
  }

  private loadConfiguration(): void {
    const token = localStorage.getItem(this.STORAGE_KEY);
    if (token) {
      this.accessToken = token;
      this.configuredSubject.next(true);
      this.tokenExpirySubject.next(this.parseExpiry(token));
    }
  }

  initialize(accessToken: string): void {
    this.accessToken = accessToken;
    this.configuredSubject.next(true);
    this.tokenExpirySubject.next(this.parseExpiry(accessToken));
    localStorage.setItem(this.STORAGE_KEY, accessToken);
    localStorage.setItem('ms-graph-ever-connected', 'true');
  }

  clearConfiguration(): void {
    this.accessToken = '';
    this.configuredSubject.next(false);
    this.tokenExpirySubject.next(null);
    this.messagesSubject.next([]);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  fetchInbox(top = 20, unreadOnly = false): Observable<MailMessage[]> {
    if (!this.accessToken) {
      this.errorSubject.next('No access token configured');
      return of([]);
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });

    const limit = unreadOnly ? 100 : top;
    // Using $filter=isRead eq false on the Graph messages endpoint can cause
    // the query to escape the folder scope and return messages from other
    // folders. To guarantee inbox-only results, we always use $orderby
    // (which strictly respects the mailFolders/inbox path) and fetch a larger
    // batch when showing unread, then filter client-side.
    const url = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=${limit}&$orderby=receivedDateTime desc&$select=id,subject,receivedDateTime,isRead,importance,from,bodyPreview,hasAttachments,webLink,body`;

    return this.http.get<{ value: MailMessage[] }>(url, { headers }).pipe(
      map(response => {
        const messages = unreadOnly
          ? response.value.filter(m => !m.isRead)
          : response.value;
        this.messagesSubject.next(messages);
        this.loadingSubject.next(false);
        return messages;
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        if (error.status === 401) {
          this.clearConfiguration();
          this.errorSubject.next('Token expired — reconnect in Connections');
        } else {
          this.errorSubject.next(error.message || 'Failed to load emails');
        }
        return of([]);
      })
    );
  }

  markAsRead(messageId: string): Observable<void> {
    if (!this.accessToken) return of(undefined);
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });
    const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`;
    return this.http.patch<void>(url, { isRead: true }, { headers }).pipe(
      tap(() => {
        const updated = this.messagesSubject.getValue().map(m =>
          m.id === messageId ? { ...m, isRead: true } : m
        );
        this.messagesSubject.next(updated);
      }),
      catchError(() => of(undefined))
    );
  }

  isConfigured(): boolean {
    return this.configuredSubject.getValue();
  }
}
