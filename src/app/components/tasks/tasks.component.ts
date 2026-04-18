import { Component } from '@angular/core';
import { TaskTrackerComponent } from '../dashboard/task-tracker/task-tracker.component';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [TaskTrackerComponent],
  templateUrl: './tasks.component.html',
  styleUrl: './tasks.component.scss'
})
export class TasksComponent {}
