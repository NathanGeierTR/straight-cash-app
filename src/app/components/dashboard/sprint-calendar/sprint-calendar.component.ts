import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdoService, AdoSprint } from '../../../services/ado.service';
import { Subject, takeUntil } from 'rxjs';

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
  imports: [CommonModule],
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
  today = new Date();
  currentMonth = new Date();
  monthName = '';
  loading = false;
  error: string | null = null;

  constructor(private adoService: AdoService) {}

  ngOnInit() {
    // Subscribe to sprints observable - automatically updates when multi-project widget loads sprints
    this.adoService.sprints$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sprints => {
        if (sprints.length > 0) {
          this.updateCurrentSprint();
        }
      });
    
    // Try to load current sprint immediately if service is initialized
    if (this.adoService.isInitialized()) {
      this.updateCurrentSprint();
    }
    
    this.generateMonthCalendar();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Update the current sprint based on today's date from the sprints observable
   */
  updateCurrentSprint() {
    const activeSprint = this.adoService.getCurrentSprint();
    
    if (activeSprint) {
      this.currentSprint = {
        number: activeSprint.sprintNumber,
        name: activeSprint.name,
        startDate: activeSprint.startDate,
        endDate: activeSprint.endDate
      };
      
      console.log('✅ Auto-selected current sprint:', {
        name: this.currentSprint.name,
        project: activeSprint.projectName,
        startDate: this.currentSprint.startDate.toLocaleDateString(),
        endDate: this.currentSprint.endDate.toLocaleDateString()
      });
      
      this.error = null;
      
      // Regenerate calendar with new sprint dates
      this.calendarDays = [];
      this.generateMonthCalendar();
    } else {
      console.warn('No active sprint found for today\'s date');
      this.error = 'No active sprint';
    }
  }

  generateMonthCalendar() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // Get month name
    this.monthName = this.currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Get first day of month and calculate starting position
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    
    // Get last day of month
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Add empty cells for days before month starts
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
    
    // Add all days of the current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      this.calendarDays.push({
        date: date,
        isToday: this.isSameDay(date, this.today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isInSprint: this.isDateInSprint(date),
        isCurrentMonth: true
      });
    }
    
    // Add remaining cells to complete the grid (if needed)
    const remainingCells = 42 - this.calendarDays.length; // 6 rows * 7 days
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
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const sprintStart = new Date(this.currentSprint.startDate.getFullYear(), 
                                  this.currentSprint.startDate.getMonth(), 
                                  this.currentSprint.startDate.getDate());
    const sprintEnd = new Date(this.currentSprint.endDate.getFullYear(), 
                                this.currentSprint.endDate.getMonth(), 
                                this.currentSprint.endDate.getDate());
    
    return dateOnly >= sprintStart && dateOnly <= sprintEnd;
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
    
    const daysLeft = Math.ceil((this.currentSprint.endDate.getTime() - this.today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysLeft);
  }
}