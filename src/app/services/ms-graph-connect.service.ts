import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, merge } from 'rxjs';
import { pairwise, filter, debounceTime } from 'rxjs/operators';
import { MicrosoftCalendarService } from './microsoft-calendar.service';
import { MicrosoftMailService } from './microsoft-mail.service';
import { MicrosoftTeamsService } from './microsoft-teams.service';

@Injectable({ providedIn: 'root' })
export class MsGraphConnectService {
  private modalOpenSubject = new BehaviorSubject<boolean>(false);
  readonly modalOpen$ = this.modalOpenSubject.asObservable();

  /**
   * Emits once whenever any MS Graph service transitions from connected → disconnected
   * (i.e. a 401 caused the service to self-clear). Multiple simultaneous drops are
   * collapsed into a single emission via debounceTime so only one toast is shown.
   */
  readonly tokenExpired$: Observable<unknown>;

  constructor(
    private calendarService: MicrosoftCalendarService,
    private mailService: MicrosoftMailService,
    private teamsService: MicrosoftTeamsService
  ) {
    this.tokenExpired$ = merge(
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
  }

  openModal(): void {
    this.modalOpenSubject.next(true);
  }

  closeModal(): void {
    this.modalOpenSubject.next(false);
  }

  /**
   * Apply one MS Graph token to all three MS services at once.
   * Each service stores it independently under its own localStorage key,
   * so they can also be managed individually on the Connections page.
   */
  applyToken(token: string): void {
    const t = token.trim();
    this.calendarService.initialize(t);
    this.mailService.initialize(t);
    this.teamsService.setAccessToken(t);
    this.closeModal();
  }
}
