import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

export interface TeamsPresence {
  availability: 'Available' | 'AvailableIdle' | 'Away' | 'BeRightBack' | 'Busy' | 'BusyIdle' | 'DoNotDisturb' | 'Offline' | 'PresenceUnknown';
  activity: string;
}

export interface TeamsChatMember {
  id: string;
  displayName: string | null;
  email: string | null;
  userId: string | null;
}

export interface TeamsChatMessage {
  id: string;
  createdDateTime: string;
  from: {
    user?: { displayName: string; id: string };
    application?: { displayName: string };
  } | null;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  messageType: string;
  deletedDateTime: string | null;
}

export interface TeamsChat {
  id: string;
  chatType: 'oneOnOne' | 'group' | 'meeting' | 'unknownFutureValue';
  topic: string | null;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  members: TeamsChatMember[];
  lastMessagePreview: {
    id: string;
    createdDateTime: string;
    body: { content: string; contentType: string };
    from: { user?: { displayName: string; id: string } } | null;
    isDeleted: boolean;
  } | null;
  viewpoint?: {
    unreadMessageCount: number;
  };
  /** Messages loaded on demand when the chat is expanded. */
  messages?: TeamsChatMessage[];
}

export interface TeamsChannel {
  id: string;
  displayName: string;
  membershipType: 'standard' | 'private' | 'shared' | 'unknownFutureValue';
  teamId: string;
  teamDisplayName: string;
  messages?: TeamsChatMessage[];
  loadError?: string;
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

  private currentUserIdSubject = new BehaviorSubject<string | null>(null);
  currentUserId$ = this.currentUserIdSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadToken();
  }

  private loadToken(): void {
    const token = localStorage.getItem(this.TOKEN_STORAGE_KEY);
    if (token) {
      this.accessTokenSubject.next(token);
      this.isAuthenticatedSubject.next(true);
      this.fetchCurrentUserId();
    }
  }

  setAccessToken(token: string): void {
    localStorage.setItem(this.TOKEN_STORAGE_KEY, token);
    localStorage.setItem('ms-graph-ever-connected', 'true');
    this.accessTokenSubject.next(token);
    this.isAuthenticatedSubject.next(true);
    this.fetchCurrentUserId();
  }

  clearAccessToken(): void {
    localStorage.removeItem(this.TOKEN_STORAGE_KEY);
    this.accessTokenSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    this.currentUserIdSubject.next(null);
  }

  private fetchCurrentUserId(): void {
    this.http.get<{ id: string }>(`${this.GRAPH_API_URL}/me?$select=id`, { headers: this.getHeaders() })
      .subscribe({ next: u => this.currentUserIdSubject.next(u.id), error: () => {} });
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
    return this.http.get<any>(`${this.GRAPH_API_URL}/me/presence`, { headers: this.getHeaders() }).pipe(
      map(response => response as TeamsPresence),
      catchError(error => {
        console.error('Error fetching presence:', error);
        return throwError(() => error);
      })
    );
  }

  getUserPresenceByEmail(email: string): Observable<TeamsPresence> {
    const url = `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}/presence`;
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      map(response => response as TeamsPresence),
      catchError(error => {
        console.error(`Error fetching user presence for ${email}:`, error);
        return throwError(() => error);
      })
    );
  }

  getBatchPresence(userIds: string[]): Observable<Map<string, TeamsPresence>> {
    const requests = userIds.map(id => ({ id, method: 'GET', url: `/users/${id}/presence` }));
    return this.http.post<any>(`${this.GRAPH_API_URL}/$batch`, { requests }, { headers: this.getHeaders() }).pipe(
      map(response => {
        const presenceMap = new Map<string, TeamsPresence>();
        response.responses.forEach((res: any) => {
          if (res.status === 200) { presenceMap.set(res.id, res.body); }
        });
        return presenceMap;
      }),
      catchError(error => {
        console.error('Error fetching batch presence:', error);
        return throwError(() => error);
      })
    );
  }

  searchUsers(query: string): Observable<TeamsUser[]> {
    const safeQuery = query.replace(/'/g, "''");
    const url = `${this.GRAPH_API_URL}/users?$filter=startswith(displayName,'${safeQuery}') or startswith(mail,'${safeQuery}')&$top=10`;
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      map(response => response.value),
      catchError(error => {
        console.error('Error searching users:', error);
        return throwError(() => error);
      })
    );
  }

  getUserByEmail(email: string): Observable<TeamsUser> {
    return this.http.get<TeamsUser>(`${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}`, { headers: this.getHeaders() }).pipe(
      catchError(error => {
        console.error('Error fetching user:', error);
        return throwError(() => error);
      })
    );
  }

  getUserProfile(email: string): Observable<any> {
    const url = `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}?$select=displayName,mail,jobTitle,officeLocation,userPrincipalName,mobilePhone,businessPhones`;
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
      catchError(error => {
        console.error('Error fetching user profile:', error);
        return throwError(() => error);
      })
    );
  }

  getUserPhoto(email: string): Observable<Blob> {
    const url = `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}/photo/$value`;
    return this.http.get(url, { headers: this.getHeaders(), responseType: 'blob' }).pipe(
      catchError(error => {
        console.error('Error fetching user photo:', error);
        return throwError(() => error);
      })
    );
  }

  getUserMailboxSettings(email: string): Observable<any> {
    const url = `${this.GRAPH_API_URL}/users/${encodeURIComponent(email)}/mailboxSettings`;
    return this.http.get<any>(url, { headers: this.getHeaders() }).pipe(
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

  // ─── Chat subjects ────────────────────────────────────────────────────────

  private chatsSubject = new BehaviorSubject<TeamsChat[]>([]);
  readonly chats$ = this.chatsSubject.asObservable();

  private chatsLoadingSubject = new BehaviorSubject<boolean>(false);
  readonly chatsLoading$ = this.chatsLoadingSubject.asObservable();

  private chatsErrorSubject = new BehaviorSubject<string | null>(null);
  readonly chatsError$ = this.chatsErrorSubject.asObservable();

  // ─── Channel subjects ─────────────────────────────────────────────────────

  private channelsSubject = new BehaviorSubject<TeamsChannel[]>([]);
  readonly channels$ = this.channelsSubject.asObservable();

  private channelsLoadingSubject = new BehaviorSubject<boolean>(false);
  readonly channelsLoading$ = this.channelsLoadingSubject.asObservable();

  private channelsErrorSubject = new BehaviorSubject<string | null>(null);
  readonly channelsError$ = this.channelsErrorSubject.asObservable();

  // ─── Chat API ─────────────────────────────────────────────────────────────

  fetchChats(top = 20): Observable<TeamsChat[]> {
    if (!this.accessTokenSubject.value) {
      this.chatsErrorSubject.next('No access token configured');
      return of([]);
    }

    this.chatsLoadingSubject.next(true);
    this.chatsErrorSubject.next(null);

    const url = `${this.GRAPH_API_URL}/me/chats?$top=${top}&$expand=lastMessagePreview,members`;

    return this.http.get<{ value: TeamsChat[] }>(url, { headers: this.getHeaders() }).pipe(
      map(response => {
        // meeting chats are old video-call threads — always exclude them
        // $orderby cannot be combined with $expand on this endpoint — sort client-side
        const chats = response.value.filter(c => c.chatType !== 'meeting').slice().sort((a, b) => {
          const aTime = a.lastUpdatedDateTime ?? a.lastMessagePreview?.createdDateTime ?? '';
          const bTime = b.lastUpdatedDateTime ?? b.lastMessagePreview?.createdDateTime ?? '';
          return bTime.localeCompare(aTime);
        });
        this.chatsSubject.next(chats);
        this.chatsLoadingSubject.next(false);
        return chats;
      }),
      catchError(error => {
        this.chatsLoadingSubject.next(false);
        if (error.status === 401) {
          this.clearAccessToken();
          this.chatsErrorSubject.next('Token expired — reconnect in Connections');
        } else {
          this.chatsErrorSubject.next(error.message || 'Failed to load chats');
        }
        return of([]);
      })
    );
  }

  fetchChatMessages(chatId: string, top = 20): Observable<TeamsChatMessage[]> {
    if (!this.accessTokenSubject.value) return of([]);

    const url = `${this.GRAPH_API_URL}/me/chats/${encodeURIComponent(chatId)}/messages?$top=${top}&$orderby=createdDateTime desc`;

    return this.http.get<{ value: TeamsChatMessage[] }>(url, { headers: this.getHeaders() }).pipe(
      map(response => {
        const messages = response.value.filter(m =>
          m.messageType === 'message' && !m.deletedDateTime
        );
        // Update the cached chat object with its messages
        const updated = this.chatsSubject.getValue().map(c =>
          c.id === chatId ? { ...c, messages } : c
        );
        this.chatsSubject.next(updated);
        return messages;
      }),
      catchError(() => of([]))
    );
  }

  // ─── Channel API ──────────────────────────────────────────────────────────

  fetchChannels(): Observable<TeamsChannel[]> {
    if (!this.accessTokenSubject.value) {
      this.channelsErrorSubject.next('No access token configured');
      return of([]);
    }

    this.channelsLoadingSubject.next(true);
    this.channelsErrorSubject.next(null);

    return this.http.get<{ value: Array<{ id: string; displayName: string }> }>(
      `${this.GRAPH_API_URL}/me/joinedTeams?$select=id,displayName`,
      { headers: this.getHeaders() }
    ).pipe(
      switchMap(teamsResp => {
        const teams = teamsResp.value;
        if (!teams.length) return of([] as TeamsChannel[]);
        return forkJoin(
          teams.map(team =>
            this.http.get<{ value: Array<{ id: string; displayName: string; membershipType: string }> }>(
              `${this.GRAPH_API_URL}/teams/${encodeURIComponent(team.id)}/channels?$select=id,displayName,membershipType`,
              { headers: this.getHeaders() }
            ).pipe(
              map(resp => resp.value.map(ch => ({
                id: ch.id,
                displayName: ch.displayName,
                membershipType: ch.membershipType as TeamsChannel['membershipType'],
                teamId: team.id,
                teamDisplayName: team.displayName,
              }))),
              catchError(() => of([] as TeamsChannel[]))
            )
          )
        ).pipe(map(results => (results as TeamsChannel[][]).flat()));
      }),
      map(channels => {
        // Preserve any already-loaded messages from the previous state
        const prev = this.channelsSubject.getValue();
        const merged = channels.map(ch => {
          const existing = prev.find(p => p.id === ch.id && p.teamId === ch.teamId);
          return existing?.messages ? { ...ch, messages: existing.messages } : ch;
        });
        this.channelsSubject.next(merged);
        this.channelsLoadingSubject.next(false);
        return merged;
      }),
      catchError(error => {
        this.channelsLoadingSubject.next(false);
        if (error.status === 401) {
          this.clearAccessToken();
          this.channelsErrorSubject.next('Token expired — reconnect in Connections');
        } else {
          this.channelsErrorSubject.next(error.message || 'Failed to load channels');
        }
        return of([]);
      })
    );
  }

  fetchChannelMessages(teamId: string, channelId: string, top = 20): Observable<TeamsChatMessage[]> {
    if (!this.accessTokenSubject.value) return of([]);

    // Note: $orderby is NOT supported on the channel messages endpoint — sort client-side
    const url = `${this.GRAPH_API_URL}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?$top=${top}`;

    return this.http.get<{ value: TeamsChatMessage[] }>(url, { headers: this.getHeaders() }).pipe(
      map(response => {
        const messages = response.value
          .filter(m => m.messageType === 'message' && !m.deletedDateTime)
          .sort((a, b) => b.createdDateTime.localeCompare(a.createdDateTime));
        const updated = this.channelsSubject.getValue().map(c =>
          c.id === channelId && c.teamId === teamId ? { ...c, messages } : c
        );
        this.channelsSubject.next(updated);
        return messages;
      }),
      catchError(error => {
        // Propagate error so component can surface it per-channel
        const msg = error.status === 403
          ? 'Missing ChannelMessage.Read.All permission'
          : error.status === 401
            ? 'Token expired'
            : `Error ${error.status}: ${error.message ?? 'Failed to load messages'}`;
        // Patch the channel with a sentinel so the template can show the error
        const updated = this.channelsSubject.getValue().map(c =>
          c.id === channelId && c.teamId === teamId ? { ...c, messages: [], loadError: msg } : c
        );
        this.channelsSubject.next(updated);
        return of([]);
      })
    );
  }

  // ─── Presence icon ────────────────────────────────────────────────────────
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