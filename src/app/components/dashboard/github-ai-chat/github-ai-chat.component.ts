import { Component, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GitHubAIService, ChatMessage, RateLimitInfo } from '../../../services/github-ai.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-github-ai-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './github-ai-chat.component.html',
  styleUrls: ['./github-ai-chat.component.scss']
})
export class GitHubAiChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  // Configuration
  showConfig = false;
  personalAccessToken = '';
  selectedModel = 'gpt-4o';
  isConfigured = false;
  availableModels: string[] = [];

  // Chat state
  messages: ChatMessage[] = [];
  currentMessage = '';
  loading = false;
  error: string | null = null;
  testingConnection = false;
  connectionTestResult: string | null = null;

  // Rate limit tracking
  rateLimitInfo: RateLimitInfo = {
    callsUsed: 0,
    callsRemaining: null,
    callsLimit: null,
    resetTime: null
  };

  // Quick prompt feature
  adoTitleInput = '';
  scrumUpdateInput = '';
  hiddenAdoTitlePrompt = 'You are an ADO specialist and need to make a short,concise, descriptive title for an ADO work item based on the following information:\n\n';
  hiddenScrumPrompt = 'You are a UX Engineer and need to give a concise update in an engineering scrum meeting based on the following recent activities:\n\n';

  // Lifecycle
  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;

  // Suggested prompts
  suggestedPrompts = [
    'Help me write a user story for a new feature',
    'Explain this code snippet to me',
    'What are best practices for API design?',
    'Help me debug an issue'
  ];

  constructor(private aiService: GitHubAIService) {}

  ngOnInit(): void {
    this.loadConfiguration();
    this.availableModels = this.aiService.getAvailableModels();
    
    // Subscribe to service observables
    this.aiService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.loading = loading);
    
    this.aiService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);

    // Subscribe to rate limit info
    this.aiService.rateLimit$
      .pipe(takeUntil(this.destroy$))
      .subscribe(info => this.rateLimitInfo = info);

    // Load conversation history from localStorage
    this.loadConversationHistory();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadConfiguration(): void {
    const token = localStorage.getItem('github-ai-token');
    const model = localStorage.getItem('github-ai-model');
    
    if (token) {
      this.personalAccessToken = token;
      this.isConfigured = true;
    }
    
    if (model) {
      this.selectedModel = model;
    }
  }

  saveConfiguration(): void {
    if (this.personalAccessToken && this.personalAccessToken.trim()) {
      this.aiService.initialize(this.personalAccessToken, this.selectedModel);
      this.isConfigured = true;
      this.showConfig = false;
      this.error = null;
      this.connectionTestResult = 'Configuration saved successfully!';
      
      setTimeout(() => {
        this.connectionTestResult = null;
      }, 3000);
    }
  }

  clearConfiguration(): void {
    if (confirm('Are you sure you want to clear your GitHub AI configuration?')) {
      this.aiService.clearConfiguration();
      this.personalAccessToken = '';
      this.selectedModel = 'gpt-4o';
      this.isConfigured = false;
      this.messages = [];
      this.clearConversationHistory();
    }
  }

  resetRateLimit(): void {
    if (confirm('Reset API call counter?')) {
      this.aiService.resetRateLimitInfo();
    }
  }

  testConnection(): void {
    if (!this.personalAccessToken || !this.personalAccessToken.trim()) {
      this.connectionTestResult = '❌ Please enter a Personal Access Token first';
      return;
    }

    this.testingConnection = true;
    this.connectionTestResult = null;
    
    // Temporarily initialize with the token
    this.aiService.initialize(this.personalAccessToken, this.selectedModel);
    
    this.aiService.testConnection().subscribe({
      next: () => {
        this.testingConnection = false;
        this.connectionTestResult = '✅ Connection successful! Token is valid.';
      },
      error: (error: Error) => {
        this.testingConnection = false;
        this.connectionTestResult = `❌ Connection failed: ${error.message}`;
      }
    });
  }

  sendMessage(messageText?: string): void {
    const textToSend = messageText || this.currentMessage.trim();
    
    if (!textToSend || this.loading) {
      return;
    }

    if (!this.isConfigured) {
      this.error = 'Please configure your GitHub AI settings first';
      this.showConfig = true;
      return;
    }

    // Add user message to chat
    const userMessage: ChatMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };
    
    this.messages.push(userMessage);
    this.currentMessage = '';
    this.error = null;
    this.shouldScrollToBottom = true;

    // Send to AI service
    this.aiService.sendMessage(textToSend, this.messages.slice(0, -1)).subscribe({
      next: (response: string) => {
        const aiMessage: ChatMessage = {
          role: 'assistant',
          content: response,
          timestamp: new Date()
        };
        
        this.messages.push(aiMessage);
        this.shouldScrollToBottom = true;
        this.saveConversationHistory();
      },
      error: (error: Error) => {
        this.error = error.message;
        // Remove the user message if the request failed
        this.messages.pop();
      }
    });
  }

  useSuggestedPrompt(prompt: string): void {
    this.currentMessage = prompt;
    this.sendMessage();
  }

  applyAdoTitlePrompt(): void {
    if (!this.adoTitleInput.trim()) {
      return;
    }
    
    // Combine hidden prompt template with user's pasted content
    const combinedPrompt = this.hiddenAdoTitlePrompt + this.adoTitleInput.trim();
    
    // Set it into the message field
    this.currentMessage = combinedPrompt;
    
    // Clear the quick prompt input
    this.adoTitleInput = '';
  }

  applyScrumPrompt(): void {
    if (!this.scrumUpdateInput.trim()) {
      return;
    }
    
    // Combine hidden prompt template with user's pasted content
    const combinedPrompt = this.hiddenScrumPrompt + this.scrumUpdateInput.trim();
    
    // Set it into the message field
    this.currentMessage = combinedPrompt;
    
    // Clear the quick prompt input
    this.scrumUpdateInput = '';
  }

  clearConversation(): void {
    if (confirm('Clear all messages in this conversation?')) {
      this.messages = [];
      this.clearConversationHistory();
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
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = 
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  private saveConversationHistory(): void {
    localStorage.setItem('github-ai-conversation', JSON.stringify(this.messages));
  }

  private loadConversationHistory(): void {
    const saved = localStorage.getItem('github-ai-conversation');
    if (saved) {
      try {
        this.messages = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load conversation history:', e);
      }
    }
  }

  private clearConversationHistory(): void {
    localStorage.removeItem('github-ai-conversation');
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (!event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.sendMessage();
    }
  }

  formatTimestamp(date: Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }
}
