import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, merge, Subject } from 'rxjs';
import { pairwise, filter, debounceTime } from 'rxjs/operators';
import { MicrosoftCalendarService } from './microsoft-calendar.service';
import { MicrosoftMailService } from './microsoft-mail.service';
import { MicrosoftTeamsService } from './microsoft-teams.service';

/**
 * Set the first time any MS Graph token is saved. Never cleared — even on
 * token expiry or explicit disconnect — so we can reliably detect "user has
 * connected before but is now disconnected" across any number of reloads.
 */
const EVER_CONNECTED_KEY = 'ms-graph-ever-connected';

@Injectable({ providedIn: 'root' })
export class MsGraphConnectService {
  private modalOpenSubject = new BehaviorSubject<boolean>(false);
  readonly modalOpen$ = this.modalOpenSubject.asObservable();

  /**
   * Emits once whenever any MS Graph service transitions from connected → disconnected,
   * OR on startup when the user has connected before but no token is present now.
   * Multiple simultaneous drops are collapsed via debounceTime.
   */
  readonly tokenExpired$: Observable<unknown>;

  constructor(
    private calendarService: MicrosoftCalendarService,
    private mailService: MicrosoftMailService,
    private teamsService: MicrosoftTeamsService
  ) {
    // Fired when a live transition occurs (token expires during the session)
    const liveExpiry$ = merge(
      calendarService.isConfigured$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      ),
      mailService.isConfigured$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      ),
      teamsService.isAuthenticated$.pipe(
        pairwise(), filter(([prev, curr]) => prev && !curr)
      )
    ).pipe(debounceTime(100));

    // Fired once on startup when the user has connected before but all tokens are now gone
    const startupExpiry$ = new Subject<void>();
    this.tokenExpired$ = merge(liveExpiry$, startupExpiry$);

    const everConnected = localStorage.getItem(EVER_CONNECTED_KEY) === 'true';
    const anyConnectedNow =
      calendarService.isConfigured() ||
      mailService.isConfigured() ||
      !!localStorage.getItem('ms-teams-token');

    if (everConnected && !anyConnectedNow) {
      // Defer so subscribers in app.component.ts have time to subscribe first
      Promise.resolve().then(() => startupExpiry$.next());
    }
  }

  openModal(): void {
    this.modalOpenSubject.next(true);
  }

  closeModal(): void {
    this.modalOpenSubject.next(false);
  }

  /**
   * Apply one MS Graph token to all three MS services at once.
   */
  applyToken(token: string): void {
    const t = token.trim();
    this.calendarService.initialize(t);
    this.mailService.initialize(t);
    this.teamsService.setAccessToken(t);
    localStorage.setItem(EVER_CONNECTED_KEY, 'true');
    this.closeModal();
  }
}
