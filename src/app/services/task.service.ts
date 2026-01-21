import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  timeTracked?: number; // Total seconds tracked
  isTimeRunning?: boolean;
  timeStartedAt?: number; // Timestamp when current session started
}

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly STORAGE_KEY = 'tasks-data';
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  public tasks$: Observable<Task[]> = this.tasksSubject.asObservable();

  constructor() {
    this.loadTasks();
  }

  /**
   * Load tasks from localStorage
   */
  private loadTasks(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const tasks = JSON.parse(stored);
        // Convert date strings back to Date objects
        tasks.forEach((task: Task) => {
          task.createdAt = new Date(task.createdAt);
          if (task.dueDate) {
            task.dueDate = new Date(task.dueDate);
          }
          if (task.completedAt) {
            task.completedAt = new Date(task.completedAt);
          }
        });
        this.tasksSubject.next(tasks);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      this.tasksSubject.next([]);
    }
  }

  /**
   * Save tasks to localStorage
   */
  private saveTasks(tasks: Task[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tasks));
      this.tasksSubject.next(tasks);
    } catch (error) {
      console.error('Error saving tasks:', error);
    }
  }

  /**
   * Get all tasks
   */
  getTasks(): Task[] {
    return this.tasksSubject.value;
  }

  /**
   * Get task by ID
   */
  getTaskById(id: string): Task | undefined {
    return this.tasksSubject.value.find(task => task.id === id);
  }

  /**
   * Add a new task
   */
  addTask(taskData: Omit<Task, 'id' | 'createdAt' | 'completed'>): Task {
    const newTask: Task = {
      id: this.generateId(),
      title: taskData.title,
      description: taskData.description,
      completed: false,
      dueDate: taskData.dueDate,
      createdAt: new Date(),
      priority: taskData.priority || 'medium',
      tags: taskData.tags || []
    };

    const tasks = [...this.tasksSubject.value, newTask];
    this.saveTasks(tasks);
    return newTask;
  }

  /**
   * Update an existing task
   */
  updateTask(id: string, updates: Partial<Task>): void {
    const tasks = this.tasksSubject.value.map(task => {
      if (task.id === id) {
        return { ...task, ...updates };
      }
      return task;
    });
    this.saveTasks(tasks);
  }

  /**
   * Toggle task completion
   */
  toggleTaskCompletion(id: string): void {
    const tasks = this.tasksSubject.value.map(task => {
      if (task.id === id) {
        const completed = !task.completed;
        return {
          ...task,
          completed,
          completedAt: completed ? new Date() : undefined
        };
      }
      return task;
    });
    this.saveTasks(tasks);
  }

  /**
   * Delete a task
   */
  deleteTask(id: string): void {
    const tasks = this.tasksSubject.value.filter(task => task.id !== id);
    this.saveTasks(tasks);
  }

  /**
   * Delete all completed tasks
   */
  deleteCompletedTasks(): void {
    const tasks = this.tasksSubject.value.filter(task => !task.completed);
    this.saveTasks(tasks);
  }

  /**
   * Get tasks by completion status
   */
  getTasksByStatus(completed: boolean): Task[] {
    return this.tasksSubject.value.filter(task => task.completed === completed);
  }

  /**
   * Get overdue tasks
   */
  getOverdueTasks(): Task[] {
    const now = new Date();
    return this.tasksSubject.value.filter(task => {
      if (!task.dueDate || task.completed) return false;
      return new Date(task.dueDate) < now;
    });
  }

  /**
   * Get tasks due today
   */
  getTasksDueToday(): Task[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.tasksSubject.value.filter(task => {
      if (!task.dueDate || task.completed) return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= today && dueDate < tomorrow;
    });
  }

  /**
   * Export tasks as JSON
   */
  exportToJson(): string {
    return JSON.stringify(this.tasksSubject.value, null, 2);
  }

  /**
   * Import tasks from JSON
   */
  importFromJson(jsonString: string): void {
    try {
      const tasks = JSON.parse(jsonString);
      // Validate and convert dates
      tasks.forEach((task: Task) => {
        task.createdAt = new Date(task.createdAt);
        if (task.dueDate) {
          task.dueDate = new Date(task.dueDate);
        }
        if (task.completedAt) {
          task.completedAt = new Date(task.completedAt);
        }
      });
      this.saveTasks(tasks);
    } catch (error) {
      console.error('Error importing tasks:', error);
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Clear all tasks
   */
  clearAllTasks(): void {
    this.saveTasks([]);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get task statistics
   */
  getStatistics(): {
    total: number;
    completed: number;
    pending: number;
    overdue: number;
    dueToday: number;
  } {
    const tasks = this.tasksSubject.value;
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      pending: tasks.filter(t => !t.completed).length,
      overdue: this.getOverdueTasks().length,
      dueToday: this.getTasksDueToday().length
    };
  }

  /**
   * Start time tracking for a task
   */
  startTimeTracking(id: string): void {
    // Stop any other running timers first
    const runningTasks = this.tasksSubject.value.filter(t => t.isTimeRunning);
    if (runningTasks.length > 0) {
      runningTasks.forEach(task => {
        this.stopTimeTracking(task.id);
      });
    }

    // Start this task's timer
    const tasks = this.tasksSubject.value.map(task => {
      if (task.id === id) {
        return {
          ...task,
          isTimeRunning: true,
          timeStartedAt: Date.now(),
          timeTracked: task.timeTracked || 0
        };
      }
      return task;
    });
    this.saveTasks(tasks);
  }

  /**
   * Stop time tracking for a task
   */
  stopTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task || !task.isTimeRunning || !task.timeStartedAt) return;

    // Calculate elapsed time and add to total
    const sessionTime = Math.floor((Date.now() - task.timeStartedAt) / 1000);
    const totalTime = (task.timeTracked || 0) + sessionTime;

    // Update the task
    const tasks = this.tasksSubject.value.map(t => {
      if (t.id === id) {
        return {
          ...t,
          isTimeRunning: false,
          timeStartedAt: undefined,
          timeTracked: totalTime
        };
      }
      return t;
    });
    this.saveTasks(tasks);
  }

  /**
   * Toggle time tracking for a task
   */
  toggleTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;

    if (task.isTimeRunning) {
      this.stopTimeTracking(id);
    } else {
      this.startTimeTracking(id);
    }
  }

  /**
   * Get current session time for a running task (in seconds)
   */
  getCurrentSessionTime(id: string): number {
    const task = this.getTaskById(id);
    if (!task || !task.isTimeRunning || !task.timeStartedAt) return 0;
    return Math.floor((Date.now() - task.timeStartedAt) / 1000);
  }

  /**
   * Get total tracked time for a task (in seconds)
   */
  getTotalTrackedTime(id: string): number {
    const task = this.getTaskById(id);
    if (!task) return 0;
    
    let totalTime = task.timeTracked || 0;
    
    // Add current session time if timer is running
    if (task.isTimeRunning && task.timeStartedAt) {
      totalTime += Math.floor((Date.now() - task.timeStartedAt) / 1000);
    }
    
    return totalTime;
  }

  /**
   * Reset time tracking for a task
   */
  resetTimeTracking(id: string): void {
    const task = this.getTaskById(id);
    if (!task) return;

    // Stop timer if running
    if (task.isTimeRunning) {
      this.stopTimeTracking(id);
    }

    // Reset time tracked
    const tasks = this.tasksSubject.value.map(t => {
      if (t.id === id) {
        return {
          ...t,
          timeTracked: 0,
          isTimeRunning: false,
          timeStartedAt: undefined
        };
      }
      return t;
    });
    this.saveTasks(tasks);
  }

  /**
   * Format time as HH:MM:SS
   */
  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
