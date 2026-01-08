import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { delay, finalize, tap } from 'rxjs/operators';
import { AdoWorkItem } from './ado.service';

@Injectable({
  providedIn: 'root'
})
export class MockAdoService {
  private workItemsSubject = new BehaviorSubject<AdoWorkItem[]>([]);
  public workItems$ = this.workItemsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private mockWorkItems: AdoWorkItem[] = [
    {
      id: 12345,
      rev: 1,
      fields: {
        'System.Id': 12345,
        'System.Title': 'Implement user authentication system',
        'System.WorkItemType': 'User Story',
        'System.State': 'Active',
        'System.AssignedTo': {
          displayName: 'John Doe',
          uniqueName: 'john.doe@company.com'
        },
        'System.CreatedDate': '2025-11-20T10:00:00Z',
        'System.ChangedDate': '2025-11-22T14:30:00Z',
        'Microsoft.VSTS.Scheduling.StoryPoints': 8,
        'Microsoft.VSTS.Common.Priority': 1,
        'System.Description': 'Implement OAuth 2.0 authentication with multi-factor support',
        'System.IterationPath': 'Project\\Sprint 23',
        'System.AreaPath': 'Project\\Security'
      }
    },
    {
      id: 12346,
      rev: 2,
      fields: {
        'System.Id': 12346,
        'System.Title': 'Fix login page responsive design',
        'System.WorkItemType': 'Bug',
        'System.State': 'New',
        'System.AssignedTo': {
          displayName: 'Jane Smith',
          uniqueName: 'jane.smith@company.com'
        },
        'System.CreatedDate': '2025-11-21T09:15:00Z',
        'System.ChangedDate': '2025-11-22T11:20:00Z',
        'Microsoft.VSTS.Common.Priority': 2,
        'System.Description': 'Login form breaks on mobile devices below 768px width',
        'System.IterationPath': 'Project\\Sprint 23',
        'System.AreaPath': 'Project\\UI'
      }
    },
    {
      id: 12347,
      rev: 1,
      fields: {
        'System.Id': 12347,
        'System.Title': 'Add dark mode theme support',
        'System.WorkItemType': 'Feature',
        'System.State': 'Resolved',
        'System.AssignedTo': {
          displayName: 'Mike Johnson',
          uniqueName: 'mike.johnson@company.com'
        },
        'System.CreatedDate': '2025-11-18T16:45:00Z',
        'System.ChangedDate': '2025-11-22T13:10:00Z',
        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
        'Microsoft.VSTS.Common.Priority': 3,
        'System.Description': 'Implement dark mode theme with user preference persistence',
        'System.IterationPath': 'Project\\Sprint 23',
        'System.AreaPath': 'Project\\UI'
      }
    },
    {
      id: 12348,
      rev: 1,
      fields: {
        'System.Id': 12348,
        'System.Title': 'Update API documentation',
        'System.WorkItemType': 'Task',
        'System.State': 'Active',
        'System.AssignedTo': {
          displayName: 'Sarah Wilson',
          uniqueName: 'sarah.wilson@company.com'
        },
        'System.CreatedDate': '2025-11-22T08:30:00Z',
        'System.ChangedDate': '2025-11-22T08:30:00Z',
        'Microsoft.VSTS.Scheduling.StoryPoints': 3,
        'Microsoft.VSTS.Common.Priority': 4,
        'System.Description': 'Update REST API documentation with new endpoints',
        'System.IterationPath': 'Project\\Sprint 23',
        'System.AreaPath': 'Project\\Documentation'
      }
    },
    {
      id: 12349,
      rev: 1,
      fields: {
        'System.Id': 12349,
        'System.Title': 'Performance optimization for dashboard',
        'System.WorkItemType': 'Task',
        'System.State': 'New',
        'System.AssignedTo': {
          displayName: 'Alex Chen',
          uniqueName: 'alex.chen@company.com'
        },
        'System.CreatedDate': '2025-11-22T12:00:00Z',
        'System.ChangedDate': '2025-11-22T12:00:00Z',
        'Microsoft.VSTS.Scheduling.StoryPoints': 5,
        'Microsoft.VSTS.Common.Priority': 2,
        'System.Description': 'Optimize dashboard loading times and reduce bundle size',
        'System.IterationPath': 'Project\\Sprint 24',
        'System.AreaPath': 'Project\\Performance'
      }
    }
  ];

  constructor() {}

  initialize(organization: string, project: string, personalAccessToken: string) {
    // Mock initialization - just simulate success
    console.log(`Mock ADO Service initialized for ${organization}/${project}`);
  }

  getCurrentSprintWorkItems(): Observable<AdoWorkItem[]> {
    return this.simulateAPICall(
      this.mockWorkItems.filter(item => 
        item.fields['System.IterationPath']?.includes('Sprint 23') &&
        item.fields['System.State'] !== 'Done' &&
        item.fields['System.State'] !== 'Removed'
      )
    );
  }

  getMyWorkItems(): Observable<AdoWorkItem[]> {
    return this.simulateAPICall(
      this.mockWorkItems.filter(item => 
        item.fields['System.AssignedTo']?.displayName === 'John Doe' ||
        item.fields['System.AssignedTo']?.displayName === 'Jane Smith'
      )
    );
  }

  getRecentWorkItems(): Observable<AdoWorkItem[]> {
    return this.simulateAPICall(this.mockWorkItems);
  }

  /**
   * Execute a custom WIQL query (mock implementation)
   */
  getCustomWorkItems(customWiql: string): Observable<AdoWorkItem[]> {
    // For mock data, just return all items regardless of the query
    // In real implementation, you could parse the query for filtering
    console.log('Mock: Executing custom query:', customWiql);
    return this.simulateAPICall(this.mockWorkItems);
  }

  getWorkItem(id: number): Observable<AdoWorkItem> {
    const workItem = this.mockWorkItems.find(item => item.id === id);
    if (!workItem) {
      throw new Error(`Work item ${id} not found`);
    }
    
    this.loadingSubject.next(true);
    this.errorSubject.next(null);
    
    return of(workItem).pipe(
      delay(500),
      finalize(() => this.loadingSubject.next(false))
    );
  }

  private simulateAPICall(data: AdoWorkItem[]): Observable<AdoWorkItem[]> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return of(data).pipe(
      delay(800), // Simulate network delay
      tap(() => this.workItemsSubject.next(data)),
      finalize(() => this.loadingSubject.next(false))
    );
  }

  getPriorityColor(priority?: number): string {
    switch (priority) {
      case 1: return '#dc3545'; // Critical
      case 2: return '#fd7e14'; // High
      case 3: return '#ffc107'; // Medium
      case 4: return '#6c757d'; // Low
      default: return '#495057'; // Default
    }
  }

  getStateColor(state: string): string {
    switch (state.toLowerCase()) {
      case 'new':
      case 'proposed': 
        return '#0dcaf0'; // Info blue
      case 'active':
      case 'in progress':
      case 'committed': 
        return '#fd7e14'; // Orange
      case 'resolved':
      case 'done':
      case 'closed': 
        return '#198754'; // Green
      default: 
        return '#6c757d'; // Gray
    }
  }
}