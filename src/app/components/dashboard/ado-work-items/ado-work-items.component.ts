import { Component, OnInit, OnDestroy, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdoService, AdoWorkItem } from '../../../services/ado.service';
import { MockAdoService } from '../../../services/mock-ado.service';
import { GitHubPrService, GitHubPullRequest, PrReviewState } from '../../../services/github-pr.service';
import { SafePipe } from '../../../pipes/safe.pipe';
import { Subject } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { of, forkJoin } from 'rxjs';

interface ProjectConfig {
  id: string;
  name: string;
  organization: string;
  project: string;
  personalAccessToken: string;
  enabled: boolean;
}

interface SprintInfo {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  daysRemaining: number | null;
  urgencyLevel: 'overdue' | 'critical' | 'warning' | 'current' | 'future' | 'none';
}

@Component({
  selector: 'app-ado-work-items',
  standalone: true,
  imports: [CommonModule, FormsModule, SafePipe],
  templateUrl: './ado-work-items.component.html',
  styleUrl: './ado-work-items.component.scss'
})
export class AdoWorkItemsComponent implements OnInit, OnDestroy {
  workItems: AdoWorkItem[] = [];
  loading = false;
  error: string | null = null;
  
  // Configuration
  organization = '';
  project = '';
  personalAccessToken = '';
  isConfigured = false;
  showConfig = false;
  testingConnection = false;
  connectionTestResult: string | null = null;
  
  // Multi-project support
  projects: ProjectConfig[] = [];
  showProjectConfig = false;
  editingProject: ProjectConfig | null = null;
  editingProjectIndex = -1;
  
  // New project form
  newProject: ProjectConfig = {
    id: '',
    name: '',
    organization: '',
    project: '',
    personalAccessToken: '',
    enabled: true
  };

  // Filters
  selectedView: 'my-items' = 'my-items';
  usingMockData = false;
  githubPrs: GitHubPullRequest[] = [];
  
  // Display options
  displayOptions = {
    showWorkItemType: true,
    showId: true,
    showTitle: true,
    showState: true,
    showAssignee: true,
    showStoryPoints: true,
    showPriority: true,
    showIteration: true,
    showDates: false,
    showDescription: false,
    showGitHubPrs: true
  };
  showDisplayOptions = false;
  
  // Filter options
  filterOptions = {
    hideDone: true,
    hideRemoved: true,
    hideClosed: false,
    hideResolved: false
  };
  showFilterOptions = false;
  filteredWorkItems: AdoWorkItem[] = [];
  prLinksCache = new Map<number, { prNumber: number; pr: GitHubPullRequest | null; url: string | null }[]>();
  linkedPrStatuses = new Map<number, PrReviewState>();

  private destroy$ = new Subject<void>();

  constructor(
    private adoService: AdoService,
    private mockAdoService: MockAdoService,
    private gitHubPrService: GitHubPrService,
    private injector: Injector
  ) {}

  ngOnInit() {
    console.log('🚀 ADO Work Items component initializing');
    
    // Check if configuration exists in localStorage
    this.loadConfiguration();
    
    // Subscribe to service observables (SKIP workItems$ since we handle multi-project manually)
    // The workItems$ subscription was causing duplicates by overwriting our manual assignments
    
    this.adoService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        // Only update if we're not already managing loading state
        if (!this.loading) {
          this.loading = loading;
        }
      });
      
    this.adoService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);

    this.gitHubPrService.prs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prs => {
        this.githubPrs = prs;
        this.rebuildPrLinksCache();
      });

    this.gitHubPrService.repoConfig$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.rebuildPrLinksCache());

    this.gitHubPrService.linkedPrStatuses$
      .pipe(takeUntil(this.destroy$))
      .subscribe(statuses => this.linkedPrStatuses = statuses);

    // Load projects first, then data
    // (Projects are loaded as part of loadConfiguration)
    
    // Load work items after component setup is complete
    setTimeout(() => {
      console.log('📋 Initial load after component setup');
      this.loadWorkItems();
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConfiguration() {
    // Load multi-project configurations FIRST
    const projectConfigs = localStorage.getItem('ado-projects');
    if (projectConfigs) {
      try {
        this.projects = JSON.parse(projectConfigs);
        this.isConfigured = this.projects.some(p => p.enabled);
        console.log('✅ Loaded project configurations:', this.projects.map(p => ({ id: p.id, name: p.name, enabled: p.enabled })));
      } catch (e) {
        console.error('Failed to load project configurations:', e);
      }
    }
    
    // Load legacy single project config for backward compatibility
    // Only convert legacy config if no multi-project configs exist
    const saved = localStorage.getItem('ado-config');
    if (saved && this.projects.length === 0) {
      try {
        const config = JSON.parse(saved);
        this.organization = config.organization || '';
        this.project = config.project || '';
        this.personalAccessToken = config.pat || '';
        this.isConfigured = !!(this.organization && this.project && this.personalAccessToken);
        
        // Convert legacy config to new format
        if (this.isConfigured) {
          this.projects = [{
            id: this.generateProjectId(),
            name: `${this.organization}/${this.project}`,
            organization: this.organization,
            project: this.project,
            personalAccessToken: this.personalAccessToken,
            enabled: true
          }];
          this.saveProjectConfigs();
          console.log('✅ Converted legacy config to multi-project format');
        }
      } catch (e) {
        console.error('Failed to load ADO configuration:', e);
      }
    }
    
    // Load display preferences
    const displayPrefs = localStorage.getItem('ado-display-options');
    if (displayPrefs) {
      try {
        this.displayOptions = { ...this.displayOptions, ...JSON.parse(displayPrefs) };
      } catch (e) {
        console.error('Failed to load display preferences:', e);
      }
    }
    
    // Load filter preferences
    const filterPrefs = localStorage.getItem('ado-filter-options');
    if (filterPrefs) {
      try {
        this.filterOptions = { ...this.filterOptions, ...JSON.parse(filterPrefs) };
      } catch (e) {
        console.error('Failed to load filter preferences:', e);
      }
    }
  }

  saveConfiguration() {
    if (this.organization && this.project && this.personalAccessToken) {
      const config = {
        organization: this.organization,
        project: this.project,
        pat: this.personalAccessToken
      };
      
      localStorage.setItem('ado-config', JSON.stringify(config));
      
      // Also add to projects array if not already there
      const existingProjectIndex = this.projects.findIndex(p => 
        p.organization === this.organization && p.project === this.project
      );
      
      if (existingProjectIndex === -1) {
        // New project - add it
        const newProject: ProjectConfig = {
          id: this.generateProjectId(),
          name: `${this.organization}/${this.project}`,
          organization: this.organization,
          project: this.project,
          personalAccessToken: this.personalAccessToken,
          enabled: true
        };
        this.projects.push(newProject);
        this.saveProjectConfigs();
        console.log('✅ Added new project via legacy config save:', newProject.name);
      } else {
        // Existing project - update PAT but preserve name
        const existingProject = this.projects[existingProjectIndex];
        this.projects[existingProjectIndex] = {
          ...existingProject,
          personalAccessToken: this.personalAccessToken
        };
        this.saveProjectConfigs();
        console.log('✅ Updated existing project PAT:', existingProject.name);
      }
      
      this.isConfigured = true;
      this.showConfig = false;
      this.loadWorkItems();
    }
  }

  clearConfiguration() {
    localStorage.removeItem('ado-config');
    this.organization = '';
    this.project = '';
    this.personalAccessToken = '';
    this.isConfigured = false;
    this.workItems = [];
  }

  saveDisplayOptions() {
    localStorage.setItem('ado-display-options', JSON.stringify(this.displayOptions));
  }

  saveFilterOptions() {
    localStorage.setItem('ado-filter-options', JSON.stringify(this.filterOptions));
    this.applyFilters();
  }

  applyFilters() {
    this.filteredWorkItems = this.workItems.filter(item => {
      const state = item.fields['System.State']?.toLowerCase() || '';
      
      if (this.filterOptions.hideDone && state === 'done') {
        return false;
      }
      if (this.filterOptions.hideRemoved && state === 'removed') {
        return false;
      }
      if (this.filterOptions.hideClosed && state === 'closed') {
        return false;
      }
      if (this.filterOptions.hideResolved && state === 'resolved') {
        return false;
      }
      
      return true;
    }).sort((a, b) => {
      // Sort by status priority: Review > In Progress > In Development > Active > Ready to Accept > Ready to Test > Committed > Sprint Ready > New
      const stateA = a.fields['System.State']?.toLowerCase() || '';
      const stateB = b.fields['System.State']?.toLowerCase() || '';
      
      const statePriority: { [key: string]: number } = {
        'review': 1,
        'in progress': 2,
        'in development': 3,
        'active': 4,
        'ready to accept': 5,
        'ready to test': 6,
        'committed': 7,
        'sprint ready': 8,
        'new': 9
      };
      
      const priorityA = statePriority[stateA] || 999;
      const priorityB = statePriority[stateB] || 999;
      
      return priorityA - priorityB;
    });
    
    // Share work items with service (use all items, not just filtered)
    this.adoService.setWorkItems(this.workItems);
    this.rebuildPrLinksCache();
  }

  private rebuildPrLinksCache(): void {
    this.prLinksCache.clear();
    for (const item of this.filteredWorkItems) {
      const id = item.fields['System.Id'] || item.id;
      this.prLinksCache.set(id, this.getGitHubPrLinks(item));
    }
    // Kick off status fetches for all linked PR numbers not yet cached
    this.prLinksCache.forEach(links => {
      links.forEach(link => this.gitHubPrService.fetchLinkedPrStatus(link.prNumber));
    });
  }

  loadWorkItems() {
    if (!this.isConfigured && !this.usingMockData) {
      // Use mock data if not configured
      this.usingMockData = true;
      this.mockAdoService.initialize('demo-org', 'demo-project', 'mock-token');
      const mockApiCall = this.mockAdoService.getMyWorkItems();
      mockApiCall.subscribe({
        next: (items: AdoWorkItem[]) => {
          this.workItems = items;
          this.applyFilters();
        },
        error: (error: any) => {
          console.error('Mock service error:', error);
          this.workItems = [];
        }
      });
      return;
    }

    this.loading = true;
    this.error = null;
    this.workItems = []; // Always clear existing items
    
    // Get enabled projects
    const enabledProjects = this.projects.filter(p => p.enabled);
    
    if (enabledProjects.length === 0) {
      this.workItems = [];
      this.applyFilters();
      this.loading = false;
      return;
    }

    // Load projects sequentially to avoid service instance conflicts
    this.loadProjectsSequentially(enabledProjects, 0);
  }

  onViewChange() {
    this.loadWorkItems();
  }

  refreshData() {
    console.log('🔄 Manual refresh requested');
    this.loadWorkItems();
  }

  getWorkItemTypeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'user story': return 'fas fa-book-open';
      case 'design story': return 'fas fa-palette';
      case 'product backlog item': return 'fas fa-clipboard-check';
      case 'task': return 'fas fa-clipboard-check';
      case 'design task': return 'fas fa-clipboard-check';
      case 'bug': return 'fas fa-bug';
      case 'feature': return 'fas fa-star';
      case 'epic': return 'fas fa-mountain';
      default: return 'fas fa-circle';
    }
  }

  getWorkItemTypeColor(type: string): string {
    switch (type.toLowerCase()) {
      case 'user story': return 'var(--saf-color-brand-sky-300)';
      case 'design story': return 'var(--saf-color-brand-sky-300)';
      case 'product backlog item': return 'var(--saf-color-brand-sky-300)';
      case 'task': return 'var(--saf-color-brand-gold-500)';
      case 'design task': return 'var(--saf-color-brand-gold-300)';
      case 'bug': return 'var(--saf-color-red-400)';
      case 'feature': return 'var(--saf-color-brand-orange-500)';
      case 'epic': return 'var(--saf-color-brand-racing-green-700)';
      default: return 'var(--saf-color-text-strong)';
    }
  }

  getPriorityColor(priority?: number): string {
    return this.adoService.getPriorityColor(priority);
  }

  getStateColor(state: string): string {
    return this.adoService.getStateColor(state);
  }

  getAssignedToInitials(assignedTo?: { displayName: string }): string {
    if (!assignedTo?.displayName) return '??';
    
    return assignedTo.displayName
      .split(' ')
      .map(name => name[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  openWorkItem(workItem: AdoWorkItem) {
    const itemId = workItem.fields['System.Id'] || workItem.id;
    const projectInfo = (workItem as any).projectInfo;
    
    if (projectInfo) {
      const url = `https://dev.azure.com/${projectInfo.organization}/${projectInfo.project}/_workitems/edit/${itemId}`;
      window.open(url, '_blank');
    } else {
      // Fallback to first project or legacy config
      const org = this.projects[0]?.organization || this.organization;
      const proj = this.projects[0]?.project || this.project;
      const url = `https://dev.azure.com/${org}/${proj}/_workitems/edit/${itemId}`;
      window.open(url, '_blank');
    }
  }

  getStoryPointsDisplay(storyPoints?: number): string {
    return storyPoints ? `${storyPoints} SP` : '';
  }

  getWorkItemId(workItem: AdoWorkItem): number {
    return workItem.fields['System.Id'] || workItem.id;
  }

  getEnabledProjectCount(): number {
    return this.projects.filter(p => p.enabled).length;
  }

  getWorkItemProjectInfo(workItem: AdoWorkItem): any {
    return (workItem as any).projectInfo;
  }

  hasProjectInfo(workItem: AdoWorkItem): boolean {
    return !!(workItem as any).projectInfo;
  }

  trackByWorkItemId(index: number, workItem: AdoWorkItem): number {
    return workItem.fields['System.Id'] || workItem.id;
  }

  testConnection() {
    if (!this.organization || !this.project || !this.personalAccessToken) {
      this.connectionTestResult = 'Please fill in all required fields first.';
      return;
    }

    this.testingConnection = true;
    this.connectionTestResult = null;

    // Initialize the service with test credentials
    this.adoService.initialize(this.organization, this.project, this.personalAccessToken);

    // Try to fetch projects as a simple test
    this.adoService.getProjects().pipe(
      catchError((error) => {
        let errorMessage = 'Connection failed: ';
        if (error.status === 401) {
          errorMessage += 'Invalid Personal Access Token or insufficient permissions.';
        } else if (error.status === 403) {
          errorMessage += 'Token does not have access to this organization.';
        } else if (error.status === 404) {
          errorMessage += 'Organization not found.';
        } else {
          errorMessage += error.message || 'Unknown error occurred.';
        }
        return of({ error: errorMessage });
      }),
      finalize(() => this.testingConnection = false)
    ).subscribe((result: any) => {
      if (result.error) {
        this.connectionTestResult = result.error;
      } else {
        this.connectionTestResult = 'Connection successful! ✓';
      }
    });
  }

  private fallbackToMockData() {
    if (!this.usingMockData) {
      console.log('Falling back to mock data...');
      this.usingMockData = true;
      this.mockAdoService.initialize('demo-org', 'demo-project', 'mock-token');
      
      // Execute my-items query with mock service
      const mockApiCall = this.mockAdoService.getMyWorkItems();
      
      mockApiCall.subscribe({
        next: (items: AdoWorkItem[]) => {
          this.workItems = items;
          this.applyFilters();
        },
        error: (error: any) => {
          console.error('Mock service error:', error);
          this.workItems = [];
        }
      });
    }
  }

  // Project management methods
  generateProjectId(): string {
    return 'proj_' + Math.random().toString(36).substr(2, 9);
  }

  saveProjectConfigs() {
    localStorage.setItem('ado-projects', JSON.stringify(this.projects));
  }

  addProject(): void {
    if (this.newProject.name && this.newProject.organization && this.newProject.project && this.newProject.personalAccessToken) {
      // Add unique ID if not already set
      if (!this.newProject.id) {
        this.newProject.id = this.generateProjectId();
      }
      
      // Create a complete copy of the project with all fields
      const projectToAdd: ProjectConfig = {
        id: this.newProject.id,
        name: this.newProject.name,
        organization: this.newProject.organization,
        project: this.newProject.project,
        personalAccessToken: this.newProject.personalAccessToken,
        enabled: this.newProject.enabled
      };
      
      this.projects.push(projectToAdd);
      this.saveProjectConfigs();
      this.resetNewProjectForm();
      
      // Update configuration status
      this.isConfigured = this.projects.some(p => p.enabled);
      
      // Always reload to ensure fresh data without duplicates
      console.log('📝 Project added, reloading all work items');
      this.loadWorkItems();
    }
  }

  editProject(project: ProjectConfig, index: number) {
    this.editingProject = { ...project };
    this.editingProjectIndex = index;
  }

  saveEditedProject() {
    if (this.editingProject && this.editingProjectIndex >= 0) {
      // Create a complete copy with all fields to ensure nothing is lost
      const updatedProject: ProjectConfig = {
        id: this.editingProject.id,
        name: this.editingProject.name,
        organization: this.editingProject.organization,
        project: this.editingProject.project,
        personalAccessToken: this.editingProject.personalAccessToken,
        enabled: this.editingProject.enabled
      };
      this.projects[this.editingProjectIndex] = updatedProject;
      this.saveProjectConfigs();
      this.isConfigured = this.projects.some(p => p.enabled);
      this.editingProject = null;
      this.editingProjectIndex = -1;
      console.log('✏️ Project edited, reloading work items');
      this.loadWorkItems();
    }
  }

  cancelEdit() {
    this.editingProject = null;
    this.editingProjectIndex = -1;
  }

  deleteProject(index: number) {
    if (confirm('Are you sure you want to remove this project?')) {
      const projectName = this.projects[index].name;
      this.projects.splice(index, 1);
      this.saveProjectConfigs();
      this.isConfigured = this.projects.some(p => p.enabled);
      console.log(`🗑️ Project "${projectName}" deleted, reloading work items`);
      this.loadWorkItems();
    }
  }

  toggleProject(index: number): void {
    const project = this.projects[index];
    project.enabled = !project.enabled;
    this.saveProjectConfigs();
    
    // Update configuration status
    this.isConfigured = this.projects.some(p => p.enabled);
    
    console.log(`🔄 Project "${project.name}" ${project.enabled ? 'enabled' : 'disabled'}, reloading work items`);
    // Always reload when toggling projects since this changes what should be displayed
    this.loadWorkItems();
  }

  resetNewProjectForm(): void {
    this.newProject = {
      id: '',
      name: '',
      organization: '',
      project: '',
      personalAccessToken: '',
      enabled: true
    };
  }

  /**
   * Load projects sequentially to avoid service instance conflicts
   */
  private loadProjectsSequentially(projects: ProjectConfig[], currentIndex: number): void {
    if (currentIndex >= projects.length) {
      // All projects loaded, finish up
      
      // Check for duplicates before finishing
      const duplicateCheck = new Map<number, number>();
      this.workItems.forEach(item => {
        const id = item.fields['System.Id'];
        duplicateCheck.set(id, (duplicateCheck.get(id) || 0) + 1);
      });
      
      const duplicates = Array.from(duplicateCheck.entries()).filter(([id, count]) => count > 1);
      if (duplicates.length > 0) {
        console.error('❌ DUPLICATES DETECTED:', duplicates.map(([id, count]) => `ID ${id}: ${count} times`));
      }
      
      this.applyFilters();
      this.loading = false;
      console.log(`✅ Successfully loaded work items from ${projects.length} projects:`, {
        totalItems: this.workItems.length,
        uniqueItems: duplicateCheck.size,
        projects: projects.map(p => p.name),
        duplicatesFound: duplicates.length
      });
      return;
    }

    const project = projects[currentIndex];
    console.log(`🔄 Loading work items from project ${currentIndex + 1}/${projects.length}: "${project.name}" (org: "${project.organization}", project: "${project.project}")`);
    console.log(`   Project exact name: [${project.project}] (${project.project.length} chars)`);
    console.log(`   Expected URL: https://dev.azure.com/${project.organization}/${project.project}/_apis/wit/wiql`);
    console.log(`   PAT configured: ${project.personalAccessToken ? 'Yes (length: ' + project.personalAccessToken.length + ')' : 'No'}`);

    // Initialize service for current project
    this.adoService.initialize(project.organization, project.project, project.personalAccessToken);
    
    // Load work items AND sprints for current project in parallel
    forkJoin({
      workItems: this.adoService.getMyWorkItems(),
      sprints: this.adoService.fetchProjectSprints()
    }).subscribe({
      next: (result) => {
        const projectWorkItems = result.workItems;
        const projectSprints = result.sprints;
        
        const beforeCount = this.workItems.length;
        console.log(`✅ Loaded ${projectWorkItems.length} items and ${projectSprints.length} sprints from "${project.name}"`);
        
        // Add project info to work items and append to main list
        const workItemsWithProject = projectWorkItems.map(item => ({
          ...item,
          projectInfo: {
            id: project.id,
            name: project.name,
            organization: project.organization,
            project: project.project
          }
        }));
        
        this.workItems = this.workItems.concat(workItemsWithProject);
        const afterCount = this.workItems.length;
        console.log(`📊 Total items: ${beforeCount} → ${afterCount} (+${afterCount - beforeCount})`);
        
        // Share all work items with the service so other components can access them
        this.adoService.setWorkItems(this.workItems);
        
        // Add sprints to the shared sprint list
        if (projectSprints.length > 0) {
          this.adoService.addSprints(projectSprints);
        }
        
        // Load next project after a small delay to avoid overwhelming the API
        setTimeout(() => {
          this.loadProjectsSequentially(projects, currentIndex + 1);
        }, 100);
      },
      error: (error: any) => {
        console.error(`❌ Error loading items from "${project.name}":`, {
          displayName: project.name,
          organization: project.organization,
          projectName: project.project,
          statusCode: error.status,
          statusText: error.statusText,
          errorMessage: error.message,
          fullError: error
        });
        
        // Set error message but continue with other projects
        if (!this.error) {
          const statusInfo = error.status ? ` (${error.status})` : '';
          this.error = `Failed to load from "${project.name}"${statusInfo}: ${error.message || error.statusText || 'Unknown error'}`;
        }
        
        // Continue with next project even if this one failed
        setTimeout(() => {
          this.loadProjectsSequentially(projects, currentIndex + 1);
        }, 100);
      }
    });
  }

  getSprintLabel(workItem: AdoWorkItem): string {
    const iterationPath: string | undefined = workItem.fields['System.IterationPath'];
    if (!iterationPath) return '';
    const lastSegment = iterationPath.split('\\').pop() || iterationPath;
    // Same regex the AdoService uses: extract sprint number from e.g. "2025_S25_Dec03-Dec16"
    const match = lastSegment.match(/S(\d+)/i);
    return match ? `Sprint ${parseInt(match[1])}` : lastSegment;
  }

  getSprintInfo(workItem: AdoWorkItem): SprintInfo {
    const iterationPath: string | undefined = workItem.fields['System.IterationPath'];
    
    if (!iterationPath) {
      return {
        name: 'No Sprint',
        startDate: null,
        endDate: null,
        daysRemaining: null,
        urgencyLevel: 'none'
      };
    }

    // Extract the sprint name from the iteration path (e.g., "Project\\2025_S25_Dec03-Dec16")
    const sprintName = iterationPath.split('\\').pop() || iterationPath;
    
    // Try to parse dates from the sprint name format: "2025_S25_Dec03-Dec16"
    const sprintDatePattern = /(\d{4})_S\d+_([A-Za-z]{3})(\d{2})-([A-Za-z]{3})(\d{2})/;
    const match = sprintName.match(sprintDatePattern);
    
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    if (match) {
      const year = parseInt(match[1]);
      const startMonth = match[2]; // e.g., "Dec"
      const startDay = parseInt(match[3]);
      const endMonth = match[4]; // e.g., "Dec"
      const endDay = parseInt(match[5]);
      
      // Parse month names to numbers (0-indexed)
      const monthMap: { [key: string]: number } = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      
      const startMonthNum = monthMap[startMonth.toLowerCase()];
      const endMonthNum = monthMap[endMonth.toLowerCase()];
      
      if (startMonthNum !== undefined && endMonthNum !== undefined) {
        startDate = new Date(year, startMonthNum, startDay);
        // If end month is earlier than start month, assume it's the next year
        const endYear = endMonthNum < startMonthNum ? year + 1 : year;
        endDate = new Date(endYear, endMonthNum, endDay);
      }
    } else {
      // Fallback: try to get dates from work item fields
      const startDateField = workItem.fields['Microsoft.VSTS.Scheduling.StartDate'];
      const finishDateField = workItem.fields['Microsoft.VSTS.Scheduling.FinishDate'];
      
      if (startDateField) startDate = new Date(startDateField);
      if (finishDateField) endDate = new Date(finishDateField);
    }
    
    if (!endDate) {
      return {
        name: sprintName,
        startDate: startDate,
        endDate: null,
        daysRemaining: null,
        urgencyLevel: 'none'
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startDateNormalized = startDate ? new Date(startDate.getTime()) : null;
    if (startDateNormalized) {
      startDateNormalized.setHours(0, 0, 0, 0);
    }
    
    const endDateNormalized = new Date(endDate.getTime());
    endDateNormalized.setHours(0, 0, 0, 0);
    
    const diffTime = endDateNormalized.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let urgencyLevel: 'overdue' | 'critical' | 'warning' | 'current' | 'future' | 'none';
    
    // Check if sprint has started yet
    if (startDateNormalized && today < startDateNormalized) {
      urgencyLevel = 'future'; // Sprint hasn't started yet
    } else if (daysRemaining < 0) {
      urgencyLevel = 'overdue'; // Overdue
    } else if (daysRemaining <= 2) {
      urgencyLevel = 'critical'; // Critical
    } else if (daysRemaining <= 6) {
      urgencyLevel = 'warning'; // 2-6 days remaining
    } else if (daysRemaining <= 14) {
      urgencyLevel = 'current'; // More than 6 days remaining in current sprint
    } else {
      urgencyLevel = 'none'; // N/A
    }

    return {
      name: sprintName,
      startDate: startDate,
      endDate: endDate,
      daysRemaining: daysRemaining,
      urgencyLevel: urgencyLevel
    };
  }

  getUrgencyTooltip(sprintInfo: SprintInfo): string {
    if (sprintInfo.urgencyLevel === 'none') {
      return 'No sprint assigned';
    }
    
    if (sprintInfo.daysRemaining === null) {
      return `Sprint: ${sprintInfo.name}`;
    }
    
    const daysText = sprintInfo.daysRemaining === 1 ? 'day' : 'days';
    
    if (sprintInfo.daysRemaining < 0) {
      const overdueDays = Math.abs(sprintInfo.daysRemaining);
      return `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} - Sprint: ${sprintInfo.name}`;
    } else if (sprintInfo.daysRemaining === 0) {
      return `Due today - Sprint: ${sprintInfo.name}`;
    } else {
      return `${sprintInfo.daysRemaining} ${daysText} remaining - Sprint: ${sprintInfo.name}`;
    }
  }

  getUrgencyIcon(urgencyLevel: string): string {
    switch (urgencyLevel) {
      case 'overdue':
        return 'fas fa-temperature-full';
      case 'critical':
        return 'fas fa-temperature-three-quarters';
      case 'warning':
        return 'fas fa-temperature-half';
      case 'current':
        return 'fas fa-temperature-quarter';
      case 'future':
        return 'fas fa-temperature-empty';
      case 'none':  
        return 'fas fa-temperature-empty';
      default:
        return 'fas fa-temperature-empty';
    }
  }

  getUrgencyColor(urgencyLevel: string): string {
    switch (urgencyLevel) {
      case 'overdue':
        return '#000000'; // Black for overdue
      case 'critical':
        return '#ff4444'; // Red for critical
      case 'warning':
        return '#ffaa00'; // Orange for warning
      case 'current':
        return '#00aa00'; // Green for current sprint
      case 'future':
        return '#cce3ffff'; // Blue for future sprint
      case 'none':
        return '#dddddd'; // Gray for no sprint
      default:
        return '#dddddd'; // Gray for no sprint
    }
  }

  getGitHubPrLinks(workItem: AdoWorkItem): { prNumber: number; pr: GitHubPullRequest | null; url: string | null }[] {
    const relations: any[] = (workItem as any).relations || [];
    const githubPrRelations = relations.filter((r: any) =>
      r.rel === 'ArtifactLink' && r.attributes?.name === 'GitHub Pull Request'
    );

    return githubPrRelations
      .map((relation: any) => {
        // ADO artifact URL format:
        // vstfs:///GitHub/PullRequest/{connId}%2F{owner}%2F{repo}%2F{prNumber}  (4 parts)
        // vstfs:///GitHub/PullRequest/{connId}%2F{repoId}%2F{prNumber}          (3 parts)
        // vstfs:///GitHub/PullRequest/{connId}%2F{prNumber}                      (2 parts)
        const rawUrl: string = relation.url ?? '';
        const parts = rawUrl.split(/%2f/i);

        let prNumber = NaN;
        let parsedUrl: string | null = null;

        if (parts.length >= 4) {
          prNumber = parseInt(parts[3], 10);
          if (!isNaN(prNumber) && parts[1] && parts[2]) {
            parsedUrl = `https://github.com/${parts[1]}/${parts[2]}/pull/${prNumber}`;
          }
        } else if (parts.length >= 2) {
          prNumber = parseInt(parts[parts.length - 1], 10);
        }

        if (isNaN(prNumber)) return null;

        const matchedPr = this.githubPrs.find(pr => pr.number === prNumber) ?? null;
        const url = matchedPr?.html_url
          ?? parsedUrl
          ?? this.gitHubPrService.getDefaultPrUrl(prNumber);
        return { prNumber, pr: matchedPr, url };
      })
      .filter((link): link is { prNumber: number; pr: GitHubPullRequest | null; url: string | null } => link !== null);
  }

  getPrStatusLabel(pr: GitHubPullRequest | null, prNumber?: number): string {
    const reviewState = prNumber !== undefined ? this.linkedPrStatuses.get(prNumber) : undefined;
    if (reviewState) {
      switch (reviewState) {
        case 'approved': return 'Approved';
        case 'changes-requested': return 'Changes Requested';
        case 'review-requested': return 'Review Requested';
        case 'merged': return 'Merged';
        case 'closed': return 'Closed';
        case 'draft': return 'Draft';
        case 'open': return 'Open';
      }
    }
    if (!pr) return '';
    if (pr.merged_at) return 'Merged';
    if (pr.state === 'closed') return 'Closed';
    if (pr.draft) return 'Draft';
    return 'Open';
  }

  getPrStatusClass(pr: GitHubPullRequest | null, prNumber?: number): string {
    const reviewState = prNumber !== undefined ? this.linkedPrStatuses.get(prNumber) : undefined;
    if (reviewState) {
      switch (reviewState) {
        case 'approved': return 'pr-approved';
        case 'changes-requested': return 'pr-changes-requested';
        case 'review-requested': return 'pr-review-requested';
        case 'merged': return 'pr-merged';
        case 'closed': return 'pr-closed';
        case 'draft': return 'pr-draft';
        case 'open': return 'pr-open';
      }
    }
    if (!pr) return 'pr-unknown';
    if (pr.merged_at) return 'pr-merged';
    if (pr.state === 'closed') return 'pr-closed';
    if (pr.draft) return 'pr-draft';
    return 'pr-open';
  }
}