import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitHubAIService, ChatMessage, RateLimitInfo } from '../../../services/github-ai.service';
import { TaskService } from '../../../services/task.service';
import { AdoService } from '../../../services/ado.service';
import { CoworkerService } from '../../../services/coworker.service';
import { Subject, combineLatest, timer } from 'rxjs';
import { takeUntil, filter, take, debounceTime } from 'rxjs/operators';

interface PrioritySummary {
  topPriorities: string[];
  urgentItems: string[];
  suggestions: string[];
  overview: string;
}

@Component({
  selector: 'app-ai-priority-summary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-priority-summary.component.html',
  styleUrls: ['./ai-priority-summary.component.scss']
})
export class AiPrioritySummaryComponent implements OnInit, OnDestroy, AfterViewChecked {
  loading = false;
  error: string | null = null;
  summary: PrioritySummary | null = null;
  lastUpdated: Date | null = null;
  isConfigured = false;
  isExpanded = true;
  waitingForData = true;
  animatedOverview = '';
  isAnimating = false;

  // Rate limit tracking
  rateLimitInfo: RateLimitInfo = {
    callsUsed: 0,
    callsRemaining: null,
    callsLimit: null,
    resetTime: null
  };

  private destroy$ = new Subject<void>();
  private dataReady$ = new Subject<void>();

  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  // Chat functionality
  chatMessages: ChatMessage[] = [];
  currentChatMessage = '';
  isChatting = false;
  chatLoading = false;
  showChat = false;
  isClippyVisible = true;
  private shouldScrollChat = false;

  constructor(
    private githubAI: GitHubAIService,
    private taskService: TaskService,
    private adoService: AdoService,
    private coworkerService: CoworkerService
  ) {}

  ngOnInit(): void {
    this.isConfigured = this.githubAI.isConfigured();
    
    // Load Clippy visibility preference from localStorage
    const savedClippyVisibility = localStorage.getItem('clippy-visible');
    if (savedClippyVisibility !== null) {
      this.isClippyVisible = savedClippyVisibility === 'true';
    }
    
    if (this.isConfigured) {
      // Subscribe to rate limit info
      this.githubAI.rateLimit$
        .pipe(takeUntil(this.destroy$))
        .subscribe(info => this.rateLimitInfo = info);

      // Load chat history
      this.loadChatHistory();
      
      // Wait for all data sources to be ready
      this.waitForDataSources();
      
      // No auto-refresh - only load on page reload
    }
  }

  toggleChat(): void {
    this.showChat = !this.showChat;
    
    // Add greeting message from Clippy if chat is opened and no messages exist
    if (this.showChat && this.chatMessages.length === 0) {
      this.chatMessages.push({
        role: 'assistant',
        content: 'Hi there! 👋 I\'m Clippy, your AI assistant. What would you like to do today? I can help you with your priorities, tasks, work items, or answer questions about your work.',
        timestamp: new Date()
      });
      this.saveChatHistory();
    }
  }

  toggleClippy(): void {
    this.isClippyVisible = !this.isClippyVisible;
    localStorage.setItem('clippy-visible', this.isClippyVisible.toString());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.dataReady$.complete();
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  resetRateLimit(): void {
    if (confirm('Reset API call counter?')) {
      this.githubAI.resetRateLimitInfo();
    }
  }

  getRateLimitPercentage(): number {
    if (this.rateLimitInfo.callsLimit && this.rateLimitInfo.callsRemaining !== null) {
      const used = this.rateLimitInfo.callsLimit - this.rateLimitInfo.callsRemaining;
      return (used / this.rateLimitInfo.callsLimit) * 100;
    }
    return 0;
  }

  getRateLimitColor(): string {
    const percentage = this.getRateLimitPercentage();
    if (percentage >= 90) return '#ff4444';
    if (percentage >= 75) return '#ffaa00';
    return '#00aa00';
  }

  getResetTimeFormatted(): string {
    if (!this.rateLimitInfo.resetTime) return 'Unknown';
    
    const now = new Date();
    const reset = new Date(this.rateLimitInfo.resetTime);
    const diffMs = reset.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Now';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  }

  getResetTimePeriod(): string {
    if (!this.rateLimitInfo.resetTime) return '';
    
    const now = new Date();
    const reset = new Date(this.rateLimitInfo.resetTime);
    const diffMs = reset.getTime() - now.getTime();
    
    if (diffMs < 0) return 'expired';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return 'daily';
    if (diffHours > 12) return 'daily';
    if (diffHours > 1) return 'hourly';
    return 'per minute';
  }

  private waitForDataSources(): void {
    this.waitingForData = true;
    this.loading = true;

    console.log('⏳ Starting to wait for dashboard data...');

    // Combine data source observables - prioritize ADO and tasks, coworkers optional
    combineLatest([
      this.taskService.tasks$,
      this.adoService.workItems$,
      this.adoService.loading$
    ]).pipe(
      // Reduce debounce to 500ms for faster response
      debounceTime(500),
      // Only proceed when ADO is not loading
      filter(([tasks, workItems, adoLoading]) => {
        console.log('🔍 Checking data readiness:', {
          tasks: tasks.length,
          workItems: workItems.length,
          adoLoading,
          readyToGenerate: !adoLoading
        });
        return !adoLoading;
      }),
      // Only take the first emission after data is ready
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: ([tasks, workItems, adoLoading]) => {
        // Get coworkers synchronously (whatever is currently available)
        const coworkers = this.coworkerService['coworkersSubject']?.value || [];
        
        console.log('✅ Dashboard data ready for AI summary:', {
          tasks: tasks.length,
          workItems: workItems.length,
          coworkers: coworkers.length,
          adoLoading,
          timeWaited: 'Less than 15 seconds'
        });
        
        this.waitingForData = false;
        this.dataReady$.next();
        
        // Generate initial summary
        this.generateSummary();
      },
      error: (err) => {
        console.error('Error waiting for data sources:', err);
        this.waitingForData = false;
        this.loading = false;
        this.error = 'Failed to load dashboard data';
      }
    });

    // Fallback: if data doesn't load within 10 seconds, generate summary anyway
    timer(10000).pipe(
      takeUntil(this.dataReady$),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.waitingForData) {
        console.warn('⚠️ Timeout (10s) waiting for dashboard data. Generating summary with available data.');
        this.waitingForData = false;
        this.generateSummary();
      }
    });
  }

  generateSummary(): void {
    if (!this.githubAI.isConfigured()) {
      this.error = 'GitHub AI not configured. Please set up your token in the GitHub AI Chat widget.';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = null;

    // Gather all dashboard data
    const tasks = this.taskService.getTasks();
    const taskStats = this.taskService.getStatistics();
    
    // NOTE: AdoService.workItems$ only contains the last loaded project
    // We need to get work items from all projects, but there's no direct way
    // For now, use what's available from the service
    const adoWorkItems = this.adoService['workItemsSubject'].value || [];
    const coworkers = this.coworkerService['coworkersSubject']?.value || [];
    
    console.log('⚠️ Note: Work items from AdoService may not include all projects');
    console.log('Available work items:', adoWorkItems.map(wi => ({
      id: wi.fields['System.Id'] || wi.id,
      hasProjectInfo: !!(wi as any).projectInfo,
      projectInfo: (wi as any).projectInfo
    })));

    // Get ADO configuration for building URLs - use getter methods
    const organization = this.adoService.getOrganization();
    const project = this.adoService.getProject();

    console.log('🤖 Generating AI summary with data:', {
      tasks: tasks.length,
      tasksPending: taskStats.pending,
      tasksOverdue: taskStats.overdue,
      adoWorkItems: adoWorkItems.length,
      coworkers: coworkers.length,
      organization,
      project
    });

    // Build context for AI
    const context = this.buildDashboardContext(tasks, taskStats, adoWorkItems, coworkers, organization, project);

    // Create prompt for AI
    const prompt = `You are an AI assistant analyzing a developer's dashboard. 
                    Based on the following data, provide a concise summary of what 
                    needs attention today. Make a colloquial motivational greeting 
                    at the start to get me excited about my day! Make the brief overview
                    in the style of a cool casual assistant that might use plenty of bro
                    speak. 
                    
                    When referencing ADO work items, embed HTML anchor tags that open in a 
                    new tab with succinct link text. These bullet point can contain non-link
                    text as well, but any references to work items must be clickable links.

    ${context}

    Please provide:
    1. A brief overview (1-2 sentences)
    2. Top 3-5 priorities for today (bullet points)

    Format your response as JSON with this structure:
    {
    "overview": "Brief overview text with HTML anchor tags if mentioning items",
    "topPriorities": ["priority 1 with HTML anchor tags", "priority 2", ...]
    }

    Keep it concise and actionable. Focus on what matters most today.`;

    this.githubAI.sendMessage(prompt)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          try {
            // Extract JSON from response (in case AI adds extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              this.summary = JSON.parse(jsonMatch[0]);
              this.lastUpdated = new Date();
              this.loading = false;
              console.log('✅ AI summary generated successfully');
              
              // Animate the overview text
              if (this.summary && this.summary.overview) {
                this.animateText(this.summary.overview, 30);
              }
            } else {
              throw new Error('Invalid response format');
            }
          } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            this.error = 'Failed to parse AI response. Please try again.';
            this.loading = false;
          }
        },
        error: (err) => {
          console.error('AI summary generation failed:', err);
          this.error = err.message || 'Failed to generate summary';
          this.loading = false;
        }
      });
  }

  private buildDashboardContext(tasks: any[], taskStats: any, adoWorkItems: any[], coworkers: any[], organization: string, project: string): string {
    const now = new Date();
    const context: string[] = [];

    console.log('🔗 Building ADO URLs with:', { organization, project, workItemsCount: adoWorkItems.length });

    // Task information
    context.push(`## Tasks`);
    context.push(`- Total: ${taskStats.total}`);
    context.push(`- Pending: ${taskStats.pending}`);
    context.push(`- Completed: ${taskStats.completed}`);
    context.push(`- Overdue: ${taskStats.overdue}`);
    context.push(`- Due today: ${taskStats.dueToday}`);

    if (tasks.length > 0) {
      const pendingTasks = tasks.filter(t => !t.completed).slice(0, 10);
      if (pendingTasks.length > 0) {
        context.push(`\nPending tasks:`);
        pendingTasks.forEach(task => {
          let taskLine = `- ${task.title}`;
          if (task.priority) {
            taskLine += ` [${task.priority} priority]`;
          }
          if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const isOverdue = dueDate < now;
            const isDueToday = dueDate.toDateString() === now.toDateString();
            if (isOverdue) {
              taskLine += ` (OVERDUE)`;
            } else if (isDueToday) {
              taskLine += ` (DUE TODAY)`;
            }
          }
          context.push(taskLine);
        });
      }
    }

    // ADO Work Items with URLs
    if (adoWorkItems.length > 0) {
      context.push(`\n## Azure DevOps Work Items (${adoWorkItems.length} total)`);
      const activeItems = adoWorkItems.filter(wi => 
        wi.fields['System.State']?.toLowerCase() === 'active' || 
        wi.fields['System.State']?.toLowerCase() === 'in progress'
      ).slice(0, 10);
      
      if (activeItems.length > 0) {
        context.push(`Active work items (with clickable URLs):`);
        activeItems.forEach(item => {
          // Try both id locations
          const id = item.fields['System.Id'] || item.id;
          const title = item.fields['System.Title'];
          const type = item.fields['System.WorkItemType'];
          const priority = item.fields['Microsoft.VSTS.Common.Priority'];
          
          if (!id) {
            console.warn('⚠️ Work item missing ID:', item);
            return;
          }
          
          // Get project info from the work item (set by ADO widget)
          let projectInfo = (item as any).projectInfo;
          
          // Fallback: if projectInfo is missing, try to use service defaults
          // This happens when using single-project legacy mode
          if (!projectInfo && organization && project) {
            console.log(`ℹ️ Work item ${id} missing projectInfo, using service defaults`);
            projectInfo = {
              organization: organization,
              project: project
            };
          }
          
          if (!projectInfo) {
            console.warn(`⚠️ Work item ${id} missing projectInfo and no service defaults available`);
            // Add item without URL
            let line = `- ${type} ${id}: ${title}`;
            if (priority) {
              line += ` (Priority ${priority})`;
            }
            context.push(line);
            return;
          }
          
          const itemOrg = projectInfo.organization;
          const itemProj = projectInfo.project;
          
          if (!itemOrg || !itemProj) {
            console.warn(`⚠️ Work item ${id} has incomplete projectInfo:`, projectInfo);
            let line = `- ${type} ${id}: ${title}`;
            if (priority) {
              line += ` (Priority ${priority})`;
            }
            context.push(line);
            return;
          }
          
          const url = `https://dev.azure.com/${itemOrg}/${encodeURIComponent(itemProj)}/_workitems/edit/${id}`;
          
          console.log(`🔗 Generated ADO URL for item ${id}:`, {
            url,
            organization: itemOrg,
            project: itemProj,
            hadProjectInfo: !!(item as any).projectInfo,
            usedFallback: !(item as any).projectInfo
          });
          
          let line = `- [${type} ${id}: ${title}](${url})`;
          if (priority) {
            line += ` (Priority ${priority})`;
          }
          context.push(line);
        });
      }
    } else {
      context.push(`\n## Azure DevOps Work Items`);
      if (!organization || !project) {
        context.push(`ADO service not initialized (organization: ${organization || 'missing'}, project: ${project || 'missing'})`);
      } else {
        context.push(`No work items loaded yet.`);
      }
    }

    // Coworker timezone info
    if (coworkers.length > 0) {
      context.push(`\n## Team Availability`);
      const coworkersInOfficeHours = coworkers.filter(c => {
        if (!c.timezone) return false;
        const time = new Date().toLocaleString('en-US', { timeZone: c.timezone });
        const hours = new Date(time).getHours();
        return hours >= 9 && hours < 17;
      });
      context.push(`${coworkersInOfficeHours.length} of ${coworkers.length} coworkers are currently in office hours`);
    }

    // Current time context
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    context.push(`\n## Context`);
    context.push(`Current time: ${timeOfDay}, ${dayOfWeek}`);

    return context.join('\n');
  }

  refresh(): void {
    this.generateSummary();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollChat) {
      this.scrollChatToBottom();
      this.shouldScrollChat = false;
    }
  }

  // Send chat message to AI
  sendChatMessage(): void {
    const message = this.currentChatMessage.trim();
    
    if (!message || this.chatLoading) {
      return;
    }

    if (!this.githubAI.isConfigured()) {
      this.error = 'GitHub AI not configured';
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    
    this.chatMessages.push(userMessage);
    this.currentChatMessage = '';
    this.chatLoading = true;
    this.shouldScrollChat = true;

    // Build context with dashboard data and chat history
    const contextPrompt = this.buildChatContext(message);

    // Send to AI with conversation history
    this.githubAI.sendMessage(contextPrompt, this.chatMessages.slice(0, -1))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const aiMessage: ChatMessage = {
            role: 'assistant',
            content: response,
            timestamp: new Date()
          };
          
          this.chatMessages.push(aiMessage);
          this.chatLoading = false;
          this.shouldScrollChat = true;
          this.saveChatHistory();
        },
        error: (err) => {
          console.error('Chat message failed:', err);
          this.chatLoading = false;
          // Remove user message on error
          this.chatMessages.pop();
        }
      });
  }

  private buildChatContext(userMessage: string): string {
    // Include the current dashboard summary as context
    let context = `You are an AI assistant helping a developer understand their daily priorities and dashboard.\n\n`;
    
    if (this.summary) {
      context += `Current Dashboard Summary:\n`;
      context += `Overview: ${this.summary.overview}\n\n`;
      
      if (this.summary.topPriorities?.length > 0) {
        context += `Top Priorities:\n`;
        this.summary.topPriorities.forEach((p, i) => {
          context += `${i + 1}. ${p}\n`;
        });
        context += `\n`;
      }
    }

    // Add current dashboard data
    const tasks = this.taskService.getTasks();
    const taskStats = this.taskService.getStatistics();
    const adoWorkItems = this.adoService['workItemsSubject'].value || [];
    
    context += `Current Dashboard Stats:\n`;
    context += `- Tasks: ${taskStats.total} total, ${taskStats.pending} pending, ${taskStats.overdue} overdue\n`;
    context += `- ADO Work Items: ${adoWorkItems.length} items\n\n`;
    
    context += `User Question: ${userMessage}\n\n`;
    context += `Please provide a helpful, concise response in a casual, friendly tone. If referencing specific work items or tasks, include relevant details.`;

    return context;
  }

  handleChatKeyDown(event: KeyboardEvent): void {
    if (!event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.sendChatMessage();
    }
  }

  clearChat(): void {
    if (confirm('Clear chat conversation?')) {
      this.chatMessages = [];
      this.clearChatHistory();
    }
  }

  private scrollChatToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = 
          this.chatContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling chat:', err);
    }
  }

  private saveChatHistory(): void {
    localStorage.setItem('ai-priority-chat-history', JSON.stringify(this.chatMessages));
  }

  private loadChatHistory(): void {
    const saved = localStorage.getItem('ai-priority-chat-history');
    if (saved) {
      try {
        this.chatMessages = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
  }

  private clearChatHistory(): void {
    localStorage.removeItem('ai-priority-chat-history');
  }

  formatChatTimestamp(date: Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  // Convert markdown links to HTML
  convertMarkdownLinks(text: string): string {
    if (!text) return '';
    // Convert [text](url) to <a href="url" target="_blank">text</a>
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  // Animate text with typewriter effect
  private animateText(text: string, speed: number = 20): void {
    this.isAnimating = true;
    this.animatedOverview = '';
    
    // Convert markdown links to HTML first
    const htmlText = this.convertMarkdownLinks(text);
    
    // Split by HTML tags to preserve them
    const parts: Array<{isTag: boolean, content: string}> = [];
    let currentPos = 0;
    const tagRegex = /<[^>]+>/g;
    let match;
    
    while ((match = tagRegex.exec(htmlText)) !== null) {
      // Add text before tag
      if (match.index > currentPos) {
        parts.push({
          isTag: false,
          content: htmlText.substring(currentPos, match.index)
        });
      }
      // Add tag
      parts.push({
        isTag: true,
        content: match[0]
      });
      currentPos = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentPos < htmlText.length) {
      parts.push({
        isTag: false,
        content: htmlText.substring(currentPos)
      });
    }
    
    let currentPartIndex = 0;
    let currentCharIndex = 0;
    
    const animate = () => {
      if (currentPartIndex >= parts.length) {
        this.isAnimating = false;
        return;
      }
      
      const currentPart = parts[currentPartIndex];
      
      if (currentPart.isTag) {
        // Add entire tag at once
        this.animatedOverview += currentPart.content;
        currentPartIndex++;
        currentCharIndex = 0;
        setTimeout(animate, 0);
      } else {
        // Add character by character
        if (currentCharIndex < currentPart.content.length) {
          this.animatedOverview += currentPart.content[currentCharIndex];
          currentCharIndex++;
          setTimeout(animate, speed);
        } else {
          currentPartIndex++;
          currentCharIndex = 0;
          setTimeout(animate, 0);
        }
      }
    };
    
    animate();
  }
}