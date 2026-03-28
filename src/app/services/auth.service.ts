import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, user, User } from '@angular/fire/auth';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);

  user$: Observable<User | null> = user(this.auth);

  login(email: string, password: string): Observable<void> {
    return from(
      signInWithEmailAndPassword(this.auth, email, password).then(() => void 0)
    );
  }

  logout(): Observable<void> {
    return from(signOut(this.auth));
  }

  isLoggedIn(): boolean {
    return !!this.auth.currentUser;
  }
}
