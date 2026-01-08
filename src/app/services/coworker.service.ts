import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Coworker {
  id: number;
  name: string;
  role?: string;
  location: string;
  timezone: string;
  avatarColor?: string;
  email?: string;
  photoUrl?: string;
  teamsPresence?: {
    availability: string;
    activity: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class CoworkerService {
  private readonly STORAGE_KEY = 'coworkers-data';
  private coworkersSubject = new BehaviorSubject<Coworker[]>([]);
  
  coworkers$: Observable<Coworker[]> = this.coworkersSubject.asObservable();

  constructor() {
    this.loadCoworkers();
  }

  private loadCoworkers(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        const coworkers = JSON.parse(stored);
        this.coworkersSubject.next(coworkers);
      } catch (error) {
        console.error('Failed to load coworkers:', error);
        this.coworkersSubject.next([]);
      }
    }
  }

  private saveCoworkers(coworkers: Coworker[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(coworkers));
    this.coworkersSubject.next(coworkers);
  }

  getCoworkers(): Coworker[] {
    return this.coworkersSubject.value;
  }

  addCoworker(coworker: Omit<Coworker, 'id'>): void {
    const coworkers = this.getCoworkers();
    const newCoworker: Coworker = {
      ...coworker,
      id: Date.now(),
      avatarColor: coworker.avatarColor || this.generateRandomColor()
    };
    this.saveCoworkers([...coworkers, newCoworker]);
  }

  updateCoworker(id: number, updates: Partial<Coworker>): void {
    const coworkers = this.getCoworkers();
    const index = coworkers.findIndex(c => c.id === id);
    if (index !== -1) {
      coworkers[index] = { ...coworkers[index], ...updates };
      this.saveCoworkers(coworkers);
    }
  }

  deleteCoworker(id: number): void {
    const coworkers = this.getCoworkers().filter(c => c.id !== id);
    this.saveCoworkers(coworkers);
  }

  reorderCoworkers(coworkers: Coworker[]): void {
    this.saveCoworkers(coworkers);
  }

  getCurrentTime(timezone: string): Date {
    const now = new Date();
    try {
      // Get time in the specified timezone
      const timeString = now.toLocaleString('en-US', { timeZone: timezone });
      return new Date(timeString);
    } catch (error) {
      console.error(`Invalid timezone: ${timezone}`, error);
      return now;
    }
  }

  getTimeProgress(timezone: string): number {
    const time = this.getCurrentTime(timezone);
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    return (totalMinutes / 1440) * 100; // 1440 minutes in a day
  }

  isWorkingHours(timezone: string): boolean {
    const time = this.getCurrentTime(timezone);
    const hours = time.getHours();
    return hours >= 9 && hours < 17;
  }

  private generateRandomColor(): string {
    const colors = [
      '#ef4444', '#f59e0b', '#10b981', '#3b82f6', 
      '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  exportToJson(): string {
    return JSON.stringify(this.getCoworkers(), null, 2);
  }

  importFromJson(json: string): void {
    try {
      const coworkers = JSON.parse(json);
      if (Array.isArray(coworkers)) {
        this.saveCoworkers(coworkers);
      }
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }
}
