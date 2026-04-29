import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type AppView = 'dashboard' | 'connections' | 'journal' | 'goals' | 'tasks' | 'open-arena-chat' | 'issues' | 'settings';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private _navigate$ = new Subject<AppView>();
  readonly navigate$ = this._navigate$.asObservable();

  /** Set to true when navigating to the journal with intent to focus the new-entry field.
   *  JournalComponent reads and clears this on ngOnInit. */
  pendingFocusJournalEntry = false;

  navigateTo(view: AppView): void {
    this._navigate$.next(view);
  }

  navigateToNewJournalEntry(): void {
    this.pendingFocusJournalEntry = true;
    this._navigate$.next('journal');
  }
}
