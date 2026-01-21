import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService, Task } from '../../../services/task.service';

interface TimeEntry {
  id: string;
  taskName: string;
  description: string;
}

@Component({
  selector: 'app-timekeeping',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './timekeeping.component.html',
  styleUrl: './timekeeping.component.scss'
})
export class TimekeepingComponent implements OnInit, OnDestroy {
  entries: Task[] = [];
  newTaskName: string = '';
  newDescription: string = '';
  
  editingId: string | null = null;
  editTaskName: string = '';
  editDescription: string = '';
  
  private updateInterval: any;

  constructor(private taskService: TaskService) {}

  ngOnInit(): void {
    this.loadEntries();
    this.startUpdateInterval();
    
    // Reset running timers on init (shouldn't persist across page loads)
    this.entries.forEach(entry => {
      if (entry.isTimeRunning) {
        this.taskService.stopTimeTracking(entry.id);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  private startUpdateInterval(): void {
    // Update every second to refresh running timer
    this.updateInterval = setInterval(() => {
      // Force change detection for any running entries
      const hasRunning = this.entries.some(e => e.isTimeRunning);
      if (hasRunning) {
        this.entries = [...this.entries];
      }
    }, 1000);
  }

  addEntry(): void {
    if (!this.newTaskName.trim()) return;

    const newTask = this.taskService.addTask({
      title: this.newTaskName.trim(),
      description: this.newDescription.trim(),
      timeTracked: 0,
      isTimeRunning: false
    });

    this.loadEntries();
    this.newTaskName = '';
    this.newDescription = '';
  }

  deleteEntry(id: string): void {
    const entry = this.entries.find(e => e.id === id);
    if (entry?.isTimeRunning) {
      this.taskService.stopTimeTracking(id);
    }
    this.taskService.deleteTask(id);
    this.loadEntries();
  }

  startEditing(id: string): void {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return;
    this.editingId = id;
    this.editTaskName = entry.title;
    this.editDescription = entry.description || '';
  }

  saveEdit(): void {
    if (!this.editingId || !this.editTaskName.trim()) return;
    
    this.taskService.updateTask(this.editingId, {
      title: this.editTaskName.trim(),
      description: this.editDescription.trim()
    });
    
    this.editingId = null;
    this.loadEntries();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editTaskName = '';
    this.editDescription = '';
  }

  toggleTimer(id: string): void {
    this.taskService.toggleTimeTracking(id);
    this.loadEntries();
  }

  resetTimer(id: string): void {
    this.taskService.resetTimeTracking(id);
    this.loadEntries();
  }

  // Get current session time (time since timer started)
  getSessionTime(id: string): number {
    return this.taskService.getCurrentSessionTime(id);
  }

  // Get grand total time (accumulated across all sessions)
  getGrandTotal(id: string): number {
    return this.taskService.getTotalTrackedTime(id);
  }

  // Format time as HH:MM:SS
  formatTime(seconds: number): string {
    return this.taskService.formatTime(seconds);
  }

  private loadEntries(): void {
    // Get tasks with time tracking info
    this.entries = this.taskService.getTasks();
  }
}
