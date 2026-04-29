import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Auth, user } from '@angular/fire/auth';
import { BehaviorSubject, Observable } from 'rxjs';

export interface UserProfile {
  jobDescription: string;
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private profileSubject = new BehaviorSubject<UserProfile>({ jobDescription: '' });
  profile$: Observable<UserProfile> = this.profileSubject.asObservable();

  private currentUserId: string | null = null;

  constructor() {
    user(this.auth).subscribe(firebaseUser => {
      if (firebaseUser) {
        this.currentUserId = firebaseUser.uid;
        this.loadProfile(firebaseUser.uid);
      } else {
        this.currentUserId = null;
        this.profileSubject.next({ jobDescription: '' });
      }
    });
  }

  private async loadProfile(uid: string): Promise<void> {
    const ref = doc(this.firestore, 'users', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      this.profileSubject.next({
        jobDescription: data['jobDescription'] ?? ''
      });
    }
  }

  async saveProfile(profile: Partial<UserProfile>): Promise<void> {
    if (!this.currentUserId) return;
    const ref = doc(this.firestore, 'users', this.currentUserId);
    await setDoc(ref, profile, { merge: true });
    this.profileSubject.next({ ...this.profileSubject.value, ...profile });
  }

  get jobDescription(): string {
    return this.profileSubject.value.jobDescription;
  }
}
