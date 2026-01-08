import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of, forkJoin } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

export interface AdoWorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Id': number;
    'System.Title': string;
    'System.WorkItemType': string;
    'System.State': string;
    'System.AssignedTo'?: {
      displayName: string;
      uniqueName: string;
    };
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
    'Microsoft.VSTS.Common.Priority'?: number;
    'System.Description'?: string;
    'System.IterationPath'?: string;
    'System.AreaPath'?: string;
    'Microsoft.VSTS.Scheduling.StartDate'?: string;
    'Microsoft.VSTS.Scheduling.FinishDate'?: string;
  };
  _links?: any;
}

export interface AdoWorkItemQueryResult {
  queryType: string;
  workItems: { id: number; url: string }[];
  columns: any[];
}

export interface AdoProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: string;
  visibility: string;
}

export interface AdoSprint {
  id: string;
  name: string;
  sprintNumber: number;
  startDate: Date;
  endDate: Date;
  projectName: string;
  organization: string;
  path: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdoService {
  private baseUrl = '';
  private organization = '';
  private project = '';
  private personalAccessToken = '';
  private headers = new HttpHeaders();

  private workItemsSubject = new BehaviorSubject<AdoWorkItem[]>([]);
  public workItems$ = this.workItemsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  private sprintsSubject = new BehaviorSubject<AdoSprint[]>([]);
  public sprints$ = this.sprintsSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Initialize the ADO service with your organization and project details
   */
  initialize(organization: string, project: string, personalAccessToken: string) {
    this.organization = organization;
    this.project = project;
    this.personalAccessToken = personalAccessToken;
    
    // Use proxy URL for development to avoid CORS issues
    this.baseUrl = `/ado-api/${organization}/${project}/_apis`;
    
    // Debug logging for authentication setup
    console.log(`🔐 Initializing ADO Service:`, {
      organization,
      project,
      baseUrl: this.baseUrl,
      patLength: personalAccessToken?.length || 0,
      patPrefix: personalAccessToken?.substring(0, 4) + '...',
      patSuffix: '...' + personalAccessToken?.substring(personalAccessToken.length - 4)
    });
    
    // Validate PAT format
    if (!personalAccessToken || personalAccessToken.trim().length === 0) {
      console.error('❌ PAT is empty or undefined!');
    } else if (personalAccessToken.length < 52) {
      console.warn('⚠️ PAT length seems short (expected 52+ chars). Current length:', personalAccessToken.length);
    }
    
    // Create authorization header
    const auth = btoa(`:${personalAccessToken}`);
    this.headers = new HttpHeaders({
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    });
    
    console.log(`✅ Authorization header created (length: ${auth.length})`);
  }

  /**
   * Get all projects in the organization
   */
  getProjects(): Observable<AdoProject[]> {
    const url = `/ado-api/${this.organization}/_apis/projects?api-version=7.0`;
    return this.http.get<any>(url, { headers: this.headers }).pipe(
      map(response => response.value),
      catchError(error => {
        this.errorSubject.next(`Failed to fetch projects: ${error.message}`);
        throw error;
      })
    );
  }

  /**
   * Query work items using WIQL (Work Item Query Language)
   */
  queryWorkItems(wiql: string): Observable<AdoWorkItem[]> {
    // Check if service is properly initialized
    if (!this.http) {
      console.error('ADO Service not properly initialized - HTTP client is missing');
      this.errorSubject.next('Service not properly initialized');
      return of([]);
    }
    
    if (!this.baseUrl || !this.headers) {
      console.error('ADO Service not initialized - call initialize() first');
      this.errorSubject.next('Service not initialized');
      return of([]);
    }
    
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    const url = `${this.baseUrl}/wit/wiql?api-version=7.0`;
    const body = { query: wiql };
    
    console.log(`📤 Making WIQL request to: ${url}`);
    console.log(`   Authorization header present: ${this.headers.has('Authorization')}`);

    return this.http.post<AdoWorkItemQueryResult>(url, body, { headers: this.headers }).pipe(
      switchMap((queryResult: AdoWorkItemQueryResult) => {
        if (queryResult.workItems.length === 0) {
          console.log(`ℹ️ No work items found for project "${this.project}"`);
          this.workItemsSubject.next([]);
          this.loadingSubject.next(false);
          return of([]);
        }
        
        console.log(`📋 Found ${queryResult.workItems.length} work items for "${this.project}"`);
        
        // Batch requests if there are too many work items (Azure DevOps recommends max 200 per request)
        const allIds = queryResult.workItems.map((wi: any) => wi.id);
        const batchSize = 200;
        
        if (allIds.length > batchSize) {
          console.log(`⚠️ Large result set detected (${allIds.length} items). Batching into groups of ${batchSize}...`);
          
          // Split into batches
          const batches: string[] = [];
          for (let i = 0; i < allIds.length; i += batchSize) {
            const batch = allIds.slice(i, i + batchSize);
            batches.push(batch.join(','));
          }
          
          console.log(`📦 Created ${batches.length} batches`);
          
          // Fetch all batches in parallel and combine results
          return forkJoin(batches.map(batchIds => this.getWorkItemsByIds(batchIds))).pipe(
            map((results: AdoWorkItem[][]) => {
              // Flatten the array of arrays
              const allWorkItems = results.flat();
              console.log(`✅ Fetched all ${allWorkItems.length} work items in ${batches.length} batches`);
              this.workItemsSubject.next(allWorkItems);
              this.loadingSubject.next(false);
              return allWorkItems;
            })
          );
        } else {
          // Single request for smaller result sets
          const ids = allIds.join(',');
          return this.getWorkItemsByIds(ids);
        }
      }),
      catchError((error: any) => {
        this.loadingSubject.next(false);
        let errorMessage = 'Failed to query work items: ';
        
        if (error.status === 400) {
          errorMessage += `Invalid query syntax for project "${this.project}". Check project name spelling.`;
          console.error(`❌ 400 Error for project "${this.project}":`, error);
          this.errorSubject.next(errorMessage);
          return of([]);
        } else if (error.status === 401) {
          errorMessage += `Authentication failed for project "${this.project}". Check your PAT.`;
          console.error(`❌ 401 UNAUTHORIZED Error Details:`, {
            organization: this.organization,
            project: this.project,
            url: url,
            patConfigured: !!this.personalAccessToken,
            patLength: this.personalAccessToken?.length || 0,
            errorDetails: error.error,
            errorMessage: error.message,
            statusText: error.statusText
          });
          console.error(`🔍 Common 401 causes:
            1. PAT is expired or invalid
            2. PAT doesn't have access to organization "${this.organization}"
            3. PAT doesn't have required scopes (needs: Work Items - Read)
            4. PAT has leading/trailing spaces or special characters
            5. Wrong organization - verify project belongs to "${this.organization}"`);
          this.errorSubject.next(errorMessage);
          return of([]);
        } else if (error.status === 404) {
          errorMessage += `Project "${this.project}" not found. Check organization and project name.`;
          console.error(`❌ 404 Error for project "${this.project}"`);
          this.errorSubject.next(errorMessage);
          return of([]);
        } else {
          errorMessage += error.message || 'Unknown error';
          console.error(`❌ Error for project "${this.project}":`, error);
        }
        
        this.errorSubject.next(errorMessage);
        throw error;
      })
    );
  }

  /**
   * Get work items by their IDs
   */
  private getWorkItemsByIds(ids: string): Observable<AdoWorkItem[]> {
    const url = `${this.baseUrl}/wit/workitems?ids=${ids}&api-version=7.0`;
    const idCount = ids.split(',').length;
    
    console.log(`📥 Fetching ${idCount} work items...`);
    
    return this.http.get<any>(url, { headers: this.headers }).pipe(
      map(response => {
        const workItems = response.value as AdoWorkItem[];
        // Don't update subjects here - let the caller handle it (for batching support)
        return workItems;
      }),
      catchError(error => {
        console.error(`❌ Failed to fetch work items batch:`, {
          idCount,
          error: error.message,
          status: error.status,
          url
        });
        this.loadingSubject.next(false);
        this.errorSubject.next(`Failed to fetch work items: ${error.message}`);
        throw error;
      })
    );
  }

  /**
   * Get current sprint work items
   */
  getCurrentSprintWorkItems(): Observable<AdoWorkItem[]> {
    // Try the simplest possible query first
    const wiql = `
      SELECT [System.Id], [System.Title], [System.State]
      FROM workitems 
      WHERE [System.TeamProject] = '${this.project}'
      ORDER BY [System.ChangedDate] DESC
    `;
    
    return this.queryWorkItems(wiql);
  }

  /**
   * Get work items assigned to current user
   */
  getMyWorkItems(): Observable<AdoWorkItem[]> {
    // Escape single quotes in project name to prevent WIQL syntax errors
    const escapedProject = this.project.replace(/'/g, "''");
    const wiql = `
      SELECT [System.Id], [System.Title], [System.State]
      FROM workitems 
      WHERE [System.TeamProject] = '${escapedProject}'
        AND [System.AssignedTo] = @me
      ORDER BY [System.ChangedDate] DESC
    `;
    
    console.log(`🔍 WIQL Query for project "${this.project}":`, wiql);
    return this.queryWorkItems(wiql);
  }

  /**
   * Get recent work items (last 30 days)
   */
  getRecentWorkItems(): Observable<AdoWorkItem[]> {
    const wiql = `
      SELECT [System.Id], [System.Title], [System.State]
      FROM workitems 
      WHERE [System.TeamProject] = '${this.project}'
      ORDER BY [System.ChangedDate] DESC
    `;
    
    return this.queryWorkItems(wiql);
  }

  /**
   * Execute a custom WIQL query
   */
  getCustomWorkItems(customWiql: string): Observable<AdoWorkItem[]> {
    // Replace project placeholder if user includes it
    const processedWiql = customWiql.replace(/\$\{project\}/g, this.project);
    return this.queryWorkItems(processedWiql);
  }

  /**
   * Get work item by ID
   */
  getWorkItem(id: number): Observable<AdoWorkItem> {
    const url = `${this.baseUrl}/wit/workitems/${id}?api-version=7.0`;
    
    return this.http.get<AdoWorkItem>(url, { headers: this.headers }).pipe(
      catchError(error => {
        this.errorSubject.next(`Failed to fetch work item ${id}: ${error.message}`);
        throw error;
      })
    );
  }

  /**
   * Update work items (used by multi-project widget to share all items)
   */
  setWorkItems(workItems: AdoWorkItem[]): void {
    this.workItemsSubject.next(workItems);
  }

  /**
   * Helper method to get work item priority color
   */
  getPriorityColor(priority?: number): string {
    switch (priority) {
      case 1: return 'var(--saf-color-semantic-critical)';
      case 2: return 'var(--saf-color-semantic-warning)';
      case 3: return 'var(--saf-color-brand-orange-500)';
      case 4: return 'var(--saf-color-text-subtle)';
      default: return 'var(--saf-color-text-strong)';
    }
  }

  /**
   * Helper method to get work item state color
   */
  getStateColor(state: string): string {
    switch (state.toLowerCase()) {
      case 'new':
        return 'var(--saf-color-yellow-200)';
      case 'proposed': 
        return 'var(--saf-color-yellow-200)';
      case 'committed': 
        return 'var(--saf-color-yellow-200)';
      case 'active':
        return 'var(--saf-color-green-200)';
      case 'in progress':
        return 'var(--saf-color-green-200)';
      case 'in development':
        return 'var(--saf-color-green-200)';
      case 'ready to accept':
        return 'var(--saf-color-red-200)';
      case 'ready to test':
        return 'var(--saf-color-red-200)';
      case 'resolved':
        return 'var(--saf-color-red-200)';
      case 'done':
        return 'var(--saf-color-red-200)';
      case 'closed': 
        return 'var(--saf-color-red-200)';
      default: 
        return 'var(--saf-color-yellow-200)';
    }
  }

  /**
   * Get the current organization
   */
  getOrganization(): string {
    return this.organization;
  }

  /**
   * Get the current project
   */
  getProject(): string {
    return this.project;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return !!this.organization && !!this.project;
  }

  /**
   * Parse a date string as a local date without timezone conversion
   * Handles both ISO strings and date-only strings
   */
  private parseLocalDate(dateString: string): Date {
    // If it's an ISO string with timezone info, extract just the date part
    const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      // Create date in local timezone (month is 0-indexed)
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // Fallback to standard parsing (shouldn't happen with ADO dates)
    return new Date(dateString);
  }

  /**
   * Fetch all iterations/sprints for the current project
   */
  fetchProjectSprints(): Observable<AdoSprint[]> {
    if (!this.isInitialized()) {
      console.warn('ADO Service not initialized');
      return of([]);
    }

    const url = `/ado-api/${this.organization}/${this.project}/_apis/work/teamsettings/iterations?api-version=7.0`;
    
    return this.http.get<any>(url, { headers: this.headers }).pipe(
      map(response => {
        const sprints: AdoSprint[] = [];
        
        if (response && response.value) {
          response.value.forEach((iteration: any) => {
            // Extract sprint number from name (e.g., "2025 Sprint S25" -> 25)
            // Look for "S" followed by digits (case-insensitive)
            const sprintMatch = iteration.name.match(/S(\d+)/i);
            const sprintNumber = sprintMatch ? parseInt(sprintMatch[1]) : 0;
            
            // Parse dates as local dates to avoid timezone conversion issues
            const startDate = this.parseLocalDate(iteration.attributes.startDate);
            const endDate = this.parseLocalDate(iteration.attributes.finishDate);
            
            sprints.push({
              id: iteration.id,
              name: iteration.name,
              sprintNumber: sprintNumber,
              startDate: startDate,
              endDate: endDate,
              projectName: this.project,
              organization: this.organization,
              path: iteration.path
            });
            
            console.log(`📅 Sprint: ${iteration.name} | Raw: ${iteration.attributes.startDate} → ${iteration.attributes.finishDate} | Parsed: ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}`);
          });
          
          console.log(`✅ Loaded ${sprints.length} sprints from project "${this.project}"`);
        }
        
        return sprints;
      }),
      catchError(error => {
        console.error('Failed to fetch sprints:', error);
        return of([]);
      })
    );
  }

  /**
   * Update the sprints list (called by multi-project widget)
   */
  addSprints(sprints: AdoSprint[]): void {
    const currentSprints = this.sprintsSubject.value;
    const updatedSprints = [...currentSprints];
    
    sprints.forEach(sprint => {
      // Check if sprint already exists (by id or by project + name)
      const exists = updatedSprints.some(s => 
        s.id === sprint.id || 
        (s.projectName === sprint.projectName && s.name === sprint.name)
      );
      
      if (!exists) {
        updatedSprints.push(sprint);
      }
    });
    
    // Sort by start date (newest first)
    updatedSprints.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
    
    this.sprintsSubject.next(updatedSprints);
    console.log(`📅 Total sprints tracked: ${updatedSprints.length}`);
  }

  /**
   * Get the current active sprint based on today's date
   */
  getCurrentSprint(): AdoSprint | null {
    const sprints = this.sprintsSubject.value;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find sprint where today is between start and end date
    const currentSprint = sprints.find(sprint => {
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      return today >= start && today <= end;
    });
    
    return currentSprint || null;
  }

  /**
   * Clear all stored sprints
   */
  clearSprints(): void {
    this.sprintsSubject.next([]);
  }
}