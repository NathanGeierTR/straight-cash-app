import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  handler: (id: number) => void;
  style?: 'primary' | 'ghost';
}

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
  duration: number; // ms; 0 = persistent
  actions?: ToastAction[];
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private idCounter = 0;
  private toastsSubject = new Subject<Toast[]>();
  toasts$ = this.toastsSubject.asObservable();

  private active: Toast[] = [];

  show(message: string, type: ToastType = 'info', title?: string, duration?: number, actions?: ToastAction[]): number {
    const effectiveDuration = duration !== undefined ? duration : this.defaultDuration(type);
    const toast: Toast = { id: ++this.idCounter, message, type, title, duration: effectiveDuration, actions };
    this.active = [...this.active, toast];
    this.toastsSubject.next(this.active);

    if (effectiveDuration > 0) {
      setTimeout(() => this.dismiss(toast.id), effectiveDuration);
    }
    return toast.id;
  }

  private defaultDuration(type: ToastType): number {
    const defaults: Record<ToastType, number> = { success: 5000, warning: 6000, info: 5000, error: 0 };
    return defaults[type];
  }

  success(message: string, title?: string, duration?: number): void {
    this.show(message, 'success', title, duration);
  }

  error(message: string, title?: string, duration?: number): void {
    this.show(message, 'error', title, duration);
  }

  warning(message: string, title?: string, duration?: number): void {
    this.show(message, 'warning', title, duration);
  }

  info(message: string, title?: string, duration?: number): void {
    this.show(message, 'info', title, duration);
  }

  dismiss(id: number): void {
    this.active = this.active.filter(t => t.id !== id);
    this.toastsSubject.next(this.active);
  }
}
