import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface TeamsPresence {
  availability: 'Available' | 'AvailableIdle' | 'Away' | 'BeRightBack' | 'Busy' | 'BusyIdle' | 'DoNotDisturb' | 'Offline' | 'PresenceUnknown';
  activity: string;
}

export interface TeamsUser {
  id: string;
  displayName: string;
  mail: string;
  jobTitle?: string;
  officeLocation?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MicrosoftTeamsService {
  private readonly GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
  private readonly TOKEN_STORAGE_KEY = 'ms-teams-token';
  
  private accessTokenSubject = new BehaviorSubject<string | null>(null);
  accessToken$ = this.accessTokenSubject.asObservable();
  
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadToken();
  }

  private loadToken(): void {
    const token = localStorage.getItem(this.TOKEN_STORAGE_KEY);
    if (token) {
      this.accessTokenSubject.next(token);
      this.isAuthenticatedSubject.next(true);
    }
  }

  setAccessToken(token: string): void {
    console.log('Setting access token, length:', token.length);
    console.log('Token starts with:', token.substring(0, 20) + '...');
    localStorage.setItem(this.TOKEN_STORAGE_KEY, token);
    this.accessTokenSubject.next(token);
    this.isAuthenticatedSubject.next(true);
  }

  clearAccessToken(): void {
    localStorage.removeItem(this.TOKEN_STORAGE_KEY);
    this.accessTokenSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  private getHeaders(): HttpHeaders {
    const token = this.accessTokenSubject.value;
    if (!token) {
      throw new Error('No access token available');
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // Get current user's presence
  getMyPresence(): Observable<TeamsPresence> {
    console.log('Fetching my presence from:', `${this.GRAPH_API_URL}/me/presence`);
    return this.http.get<any>(
      `${this.GRAPH_API_URL}/me/presence`,
      { headers: this.getHeaders() }
    ).pipe(
      map(response => {
        console.log('Raw API response:', response);
        return response as TeamsPresence;
      }),
      catchError(error => {
        console.error('Error fetching presence:', error);
        return throwError(() => error);
      })
    );
  }

  // Get specific user's presence by email
  getUserPresenceByEmail(email: string): Observable<TeamsPresence> {
    const encodedEmail = encodeURIComponent(email);
    const url = `${this.GRAPH_API_URL}/users/${encodedEmail}/presence`;
    console.log('Fetching presence for:', email, 'URL:', url);
    
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      map(response => {
        console.log(`Raw API response for ${email}:`, response);
        return response as TeamsPresence;
      }),
      catchError(error => {
        console.error(`Error fetching user presence for ${email}:`, error);
        return throwError(() => error);
      })
    );
  }

  // Get multiple users' presence (batch)
  getBatchPresence(userIds: string[]): Observable<Map<string, TeamsPresence>> {
    const requests = userIds.map(id => ({
      id: id,
      method: 'GET',
      url: `/users/${id}/presence`
    }));

    return this.http.post<any>(
      `${this.GRAPH_API_URL}/$batch`,
      { requests },
      { headers: this.getHeaders() }
    ).pipe(
      map(response => {
        const presenceMap = new Map<string, TeamsPresence>();
        response.responses.forEach((res: any) => {
          if (res.status === 200) {
            presenceMap.set(res.id, res.body);
          }
        });
        return presenceMap;
      }),
      catchError(error => {
        console.error('Error fetching batch presence:', error);
        return throwError(() => error);
      })
    );
  }

  // Search for users by name
  searchUsers(query: string): Observable<TeamsUser[]> {
    return this.http.get<any>(
      `${this.GRAPH_API_URL}/users?$filter=startswith(displayName,'${query}') or startswith(mail,'${query}')&$top=10`,
      { headers: this.getHeaders() }
    ).pipe(
      map(response => response.value),
      catchError(error => {
        console.error('Error searching users:', error);
        return throwError(() => error);
      })
    );
  }

  // Get user by email
  getUserByEmail(email: string): Observable<TeamsUser> {
    return this.http.get<TeamsUser>(
      `${this.GRAPH_API_URL}/users/${email}`,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching user:', error);
        return throwError(() => error);
      })
    );
  }

  // Get user profile with photo
  getUserProfile(email: string): Observable<any> {
    return this.http.get<any>(
      `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}?$select=displayName,mail,jobTitle,officeLocation,userPrincipalName,mobilePhone,businessPhones`,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching user profile:', error);
        return throwError(() => error);
      })
    );
  }

  // Get user profile photo
  getUserPhoto(email: string): Observable<Blob> {
    return this.http.get(
      `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}/photo/$value`,
      { 
        headers: this.getHeaders(),
        responseType: 'blob'
      }
    ).pipe(
      catchError(error => {
        console.error('Error fetching user photo:', error);
        return throwError(() => error);
      })
    );
  }

  // Get user's mailbox settings (includes timezone)
  getUserMailboxSettings(email: string): Observable<any> {
    return this.http.get<any>(
      `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}/mailboxSettings`,
      { headers: this.getHeaders() }
    ).pipe(
      catchError(error => {
        console.error('Error fetching mailbox settings:', error);
        return throwError(() => error);
      })
    );
  }

  // Map Windows timezone to IANA timezone
  mapWindowsTimezoneToIANA(windowsTimezone: string): string {
    const timezoneMap: { [key: string]: string } = {
      'Pacific Standard Time': 'America/Los_Angeles',
      'Mountain Standard Time': 'America/Denver',
      'Central Standard Time': 'America/Chicago',
      'Eastern Standard Time': 'America/New_York',
      'GMT Standard Time': 'Europe/London',
      'Romance Standard Time': 'Europe/Paris',
      'W. Europe Standard Time': 'Europe/Berlin',
      'Belarus Standard Time': 'Europe/Minsk',
      'India Standard Time': 'Asia/Kolkata',
      'Arabian Standard Time': 'Asia/Dubai',
      'Singapore Standard Time': 'Asia/Singapore',
      'China Standard Time': 'Asia/Shanghai',
      'Tokyo Standard Time': 'Asia/Tokyo',
      'AUS Eastern Standard Time': 'Australia/Sydney',
      'UTC': 'UTC'
    };

    return timezoneMap[windowsTimezone] || 'America/New_York'; // Default fallback
  }

  // Helper method to get presence status color
  getPresenceColor(availability: string): string {
    switch (availability) {
      case 'Available': return '#92c353';
      case 'Busy': return '#c4314b';
      case 'DoNotDisturb': return '#c4314b';
      case 'Away': return '#ffaa44';
      case 'BeRightBack': return '#ffaa44';
      case 'Offline': return '#8a8886';
      default: return '#8a8886';
    }
  }

  // Helper method to get presence icon
  getPresenceIcon(availability: string): string {
    switch (availability) {
      case 'Available': return 'fa-circle';
      case 'Busy': return 'fa-minus-circle';
      case 'DoNotDisturb': return 'fa-minus-circle';
      case 'Away': return 'fa-clock';
      case 'BeRightBack': return 'fa-clock';
      case 'Offline': return 'fa-circle';
      default: return 'fa-question-circle';
    }
  }
}