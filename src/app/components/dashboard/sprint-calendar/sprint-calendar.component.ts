import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { LinearService, LinearCycle } from '../../../services/linear.service';
import { Subject, takeUntil, interval } from 'rxjs';

interface CalendarDay {
  date: Date;
  isToday: boolean;
  isWeekend: boolean;
  isInSprint: boolean;
  isCurrentMonth: boolean;
}

@Component({
  selector: 'app-sprint-calendar',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './sprint-calendar.component.html',
  styleUrl: './sprint-calendar.component.scss'
})
export class SprintCalendarComponent implements OnInit, OnDestroy {
  currentSprint: {
    number: number;
    name: string;
    startDate: Date;
    endDate: Date;
  } | null = null;

  private destroy$ = new Subject<void>();

  calendarDays: CalendarDay[] = [];
  monthDays: CalendarDay[] = [];
  today = new Date();
  currentMonth = new Date();
  monthName = '';
  loading = false;
  error: string | null = null;
  showPopover = false;

  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private linearService: LinearService) {}

  ngOnInit() {
    this.linearService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        if (configured) {
          this.loadCycle();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadCycle());
        } else {
          this.currentSprint = null;
          this.monthDays = [];
          this.error = null;
        }
      });

    this.linearService.activeCycle$
      .pipe(takeUntil(this.destroy$))
      .subscribe(cycle => this.applyLinearCycle(cycle));

    this.generateMonthCalendar();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.retryTimer) { clearTimeout(this.retryTimer); }
  }

  loadCycle() {
    this.loading = true;
    this.linearService.silentlyRefreshCycle().subscribe(() => (this.loading = false));
  }

  private applyLinearCycle(cycle: LinearCycle | null) {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (!cycle) {
      this.currentSprint = null;
      this.monthDays = [];
      this.error = this.linearService.isConfigured() ? 'No active cycle' : null;
      // Auto-retry a few times — the API occasionally returns null transiently
      if (this.linearService.isConfigured() && this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.retryTimer = setTimeout(() => this.loadCycle(), 15_000);
      }
      return;
    }
    this.retryCount = 0;
    this.error = null;
    const parseLocalDate = (iso: string) => {
      const [y, m, d] = iso.substring(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d);
    };
    this.currentSprint = {
      number: cycle.number,
      name: cycle.name || `Cycle ${cycle.number}`,
      startDate: parseLocalDate(cycle.startsAt),
      endDate: parseLocalDate(cycle.endsAt),
    };
    this.calendarDays = [];
    this.generateMonthCalendar();
    this.buildSprintDays();
  }

  generateMonthCalendar() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();

    this.monthName = this.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonthDate = new Date(year, month, -(startingDayOfWeek - i - 1));
      this.calendarDays.push({
        date: prevMonthDate,
        isToday: false,
        isWeekend: prevMonthDate.getDay() === 0 || prevMonthDate.getDay() === 6,
        isInSprint: this.isDateInSprint(prevMonthDate),
        isCurrentMonth: false
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      this.calendarDays.push({
        date,
        isToday: this.isSameDay(date, this.today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isInSprint: this.isDateInSprint(date),
        isCurrentMonth: true
      });
    }

    const remainingCells = 42 - this.calendarDays.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextMonthDate = new Date(year, month + 1, i);
      this.calendarDays.push({
        date: nextMonthDate,
        isToday: false,
        isWeekend: nextMonthDate.getDay() === 0 || nextMonthDate.getDay() === 6,
        isInSprint: this.isDateInSprint(nextMonthDate),
        isCurrentMonth: false
      });
    }
  }

  isDateInSprint(date: Date): boolean {
    if (!this.currentSprint) return false;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(this.currentSprint.startDate.getFullYear(), this.currentSprint.startDate.getMonth(), this.currentSprint.startDate.getDate());
    const e = new Date(this.currentSprint.endDate.getFullYear(), this.currentSprint.endDate.getMonth(), this.currentSprint.endDate.getDate());
    return d >= s && d <= e;
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  }

  getSprintProgress(): number {
    if (!this.currentSprint) return 0;
    const totalDays = Math.ceil((this.currentSprint.endDate.getTime() - this.currentSprint.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.ceil((this.today.getTime() - this.currentSprint.startDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(100, (daysPassed / totalDays) * 100));
  }

  getDaysRemaining(): number {
    if (!this.currentSprint) return 0;
    const end = new Date(this.currentSprint.endDate.getFullYear(), this.currentSprint.endDate.getMonth(), this.currentSprint.endDate.getDate());
    const tomorrow = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate() + 1);
    let count = 0;
    for (let d = new Date(tomorrow); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  }

  togglePopover(event: MouseEvent) {
    event.stopPropagation();
    if (window.innerWidth > 600) return;
    this.showPopover = !this.showPopover;
  }

  closePopover() {
    this.showPopover = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showPopover) {
      this.showPopover = false;
    }
  }

  buildSprintDays() {
    if (!this.currentSprint) { this.monthDays = []; return; }
    const days: CalendarDay[] = [];
    const start = new Date(this.currentSprint.startDate.getFullYear(), this.currentSprint.startDate.getMonth(), this.currentSprint.startDate.getDate());
    const end = new Date(this.currentSprint.endDate.getFullYear(), this.currentSprint.endDate.getMonth(), this.currentSprint.endDate.getDate());
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      days.push({
        date,
        isToday: this.isSameDay(date, this.today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isInSprint: true,
        isCurrentMonth: date.getMonth() === this.today.getMonth()
      });
    }
    this.monthDays = days;
  }
}