import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService, Task } from '../../../services/task.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-task-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-tracker.component.html',
  styleUrl: './task-tracker.component.scss'
})
export class TaskTrackerComponent implements OnInit, OnDestroy {
  tasks: Task[] = [];
  private destroy$ = new Subject<void>();

  selectedFilter: 'all' | 'completed' | 'pending' = 'all';
  selectedPriority: 'all' | 'low' | 'medium' | 'high' = 'all';

  // New Task Form
  showNewTaskForm = false;
  newTask = {
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    tags: ''
  };

  // Edit Task
  editingTaskId: string | null = null;
  editForm = {
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    tags: ''
  };

  constructor(private taskService: TaskService) {}

  ngOnInit() {
    this.taskService.tasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.tasks = tasks;
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredTasks(): Task[] {
    return this.tasks.filter(task => {
      const statusMatch = this.selectedFilter === 'all' || 
                         (this.selectedFilter === 'completed' && task.completed) ||
                         (this.selectedFilter === 'pending' && !task.completed);
      const priorityMatch = this.selectedPriority === 'all' || task.priority === this.selectedPriority;
      return statusMatch && priorityMatch;
    });
  }

  get tasksByStatus() {
    return {
      total: this.tasks.length,
      completed: this.tasks.filter(t => t.completed).length,
      pending: this.tasks.filter(t => !t.completed).length,
      overdue: this.tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length
    };
  }

  toggleNewTaskForm() {
    this.showNewTaskForm = !this.showNewTaskForm;
    if (!this.showNewTaskForm) {
      this.resetNewTaskForm();
    }
  }

  resetNewTaskForm() {
    this.newTask = {
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      tags: ''
    };
  }

  addTask() {
    if (!this.newTask.title.trim()) {
      return;
    }

    const tagsArray = this.newTask.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    this.taskService.addTask({
      title: this.newTask.title.trim(),
      description: this.newTask.description?.trim(),
      priority: this.newTask.priority,
      dueDate: this.newTask.dueDate ? new Date(this.newTask.dueDate) : undefined,
      tags: tagsArray
    });

    this.toggleNewTaskForm();
  }

  toggleTaskCompletion(task: Task) {
    this.taskService.toggleTaskCompletion(task.id);
  }

  deleteTask(taskId: string) {
    if (confirm('Are you sure you want to delete this task?')) {
      this.taskService.deleteTask(taskId);
    }
  }

  startEditTask(task: Task) {
    this.editingTaskId = task.id;
    this.editForm = {
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'medium',
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
      tags: task.tags?.join(', ') || ''
    };
  }

  saveTaskEdit() {
    if (!this.editingTaskId || !this.editForm.title.trim()) {
      return;
    }

    const tagsArray = this.editForm.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    this.taskService.updateTask(this.editingTaskId, {
      title: this.editForm.title.trim(),
      description: this.editForm.description?.trim(),
      priority: this.editForm.priority,
      dueDate: this.editForm.dueDate ? new Date(this.editForm.dueDate) : undefined,
      tags: tagsArray
    });

    this.cancelEdit();
  }

  cancelEdit() {
    this.editingTaskId = null;
    this.editForm = {
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      tags: ''
    };
  }

  isEditing(taskId: string): boolean {
    return this.editingTaskId === taskId;
  }

  clearCompletedTasks() {
    if (confirm('Are you sure you want to delete all completed tasks?')) {
      this.taskService.deleteCompletedTasks();
    }
  }

  getPriorityClass(priority: string): string {
    const priorityClasses: { [key: string]: string } = {
      'low': 'priority-low',
      'medium': 'priority-medium',
      'high': 'priority-high'
    };
    return priorityClasses[priority] || '';
  }

  isOverdue(task: Task): boolean {
    return !task.completed && task.dueDate ? new Date() > new Date(task.dueDate) : false;
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'No due date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date));
  }

  getDaysUntilDue(task: Task): number {
    if (!task.dueDate) return 0;
    const now = new Date();
    const due = new Date(task.dueDate);
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  trackByTaskId(index: number, task: Task): string {
    return task.id;
  }

  // Convert URLs in text to clickable links with succinct text
  convertUrlsToLinks(text: string | undefined): string {
    if (!text) return '';
    
    // Regular expression to match URLs
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    
    return text.replace(urlPattern, (url) => {
      // Extract domain and path for succinct link text
      let linkText = 'link';
      
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        
        // Use domain name or last meaningful path segment
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          // If it's a work item or issue, use that
          if (/\d+/.test(lastPart) || lastPart.includes('issue') || lastPart.includes('item')) {
            linkText = lastPart.length > 20 ? lastPart.substring(0, 20) + '...' : lastPart;
          } else {
            linkText = hostname.split('.')[0]; // First part of domain
          }
        } else {
          linkText = hostname.split('.')[0];
        }
      } catch (e) {
        linkText = 'link';
      }
      
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="${url}">${linkText}</a>`;
    });
  }
}