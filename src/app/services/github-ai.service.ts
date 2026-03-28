import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { Firestore, doc, setDoc, onSnapshot, increment } from '@angular/fire/firestore';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface GitHubModelResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface RateLimitInfo {
  callsUsed: number;
  callsRemaining: number | null;
  callsLimit: number | null;
  resetTime: Date | null;
}

@Injectable({
  providedIn: 'root'
})
export class GitHubAIService {
  private apiEndpoint = 'https://models.inference.ai.azure.com/chat/completions';
  private personalAccessToken: string = '';
  private modelName: string = 'gpt-4o'; // Default model
  
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();
  
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();
  
  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  // Rate limit tracking
  private rateLimitSubject = new BehaviorSubject<RateLimitInfo>({
    callsUsed: 0,
    callsRemaining: null,
    callsLimit: null,
    resetTime: null
  });
  public rateLimit$ = this.rateLimitSubject.asObservable();

  private readonly COUNTER_DOC = 'api-counters/github-ai';

  constructor(private http: HttpClient, private firestore: Firestore) {
    this.loadConfiguration();
    this.loadRateLimitInfo();
  }

  /**
   * Initialize the GitHub AI service with PAT
   */
  initialize(token: string, model?: string): void {
    this.personalAccessToken = token;
    if (model) {
      this.modelName = model;
    }
    this.saveConfiguration();
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfiguration(): void {
    const token = localStorage.getItem('github-ai-token');
    const model = localStorage.getItem('github-ai-model');
    
    if (token) {
      this.personalAccessToken = token;
    }
    if (model) {
      this.modelName = model;
    }
  }

  /**
   * Save configuration to localStorage
   */
  private saveConfiguration(): void {
    if (this.personalAccessToken) {
      localStorage.setItem('github-ai-token', this.personalAccessToken);
    }
    if (this.modelName) {
      localStorage.setItem('github-ai-model', this.modelName);
    }
  }

  /**
   * Subscribe to call counter in Firestore in real-time
   */
  private loadRateLimitInfo(): void {
    const ref = doc(this.firestore, this.COUNTER_DOC);
    onSnapshot(ref, snapshot => {
      const current = this.rateLimitSubject.value;
      this.rateLimitSubject.next({
        ...current,
        callsUsed: snapshot.exists() ? (snapshot.data()['callsUsed'] ?? 0) : 0
      });
    }, e => console.error('Failed to listen to rate limit from Firestore:', e));
  }

  /**
   * Persist the full RateLimitInfo snapshot to Firestore
   */
  private saveRateLimitInfo(info: RateLimitInfo): void {
    this.rateLimitSubject.next(info);
    const ref = doc(this.firestore, this.COUNTER_DOC);
    setDoc(ref, { callsUsed: info.callsUsed }, { merge: true })
      .catch(e => console.error('Failed to save rate limit to Firestore:', e));
  }

  /**
   * Update rate limit info from API response headers
   */
  private updateRateLimitFromHeaders(headers: HttpHeaders, isSuccess: boolean = true): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');
    const reset = headers.get('x-ratelimit-reset');

    const current = this.rateLimitSubject.value;
    const updated: RateLimitInfo = {
      callsUsed: current.callsUsed + 1,
      callsRemaining: remaining ? parseInt(remaining, 10) : (isSuccess && current.callsRemaining === 0 ? null : current.callsRemaining),
      callsLimit: limit ? parseInt(limit, 10) : current.callsLimit,
      resetTime: reset ? new Date(parseInt(reset, 10) * 1000) : current.resetTime
    };

    // Atomically increment in Firestore so concurrent tabs don't overwrite each other
    const ref = doc(this.firestore, this.COUNTER_DOC);
    setDoc(ref, { callsUsed: increment(1) }, { merge: true })
      .catch(e => console.error('Failed to increment call counter in Firestore:', e));

    this.rateLimitSubject.next(updated);
  }

  /**
   * Clear configuration
   */
  clearConfiguration(): void {
    this.personalAccessToken = '';
    this.modelName = 'gpt-4o';
    localStorage.removeItem('github-ai-token');
    localStorage.removeItem('github-ai-model');
    this.messagesSubject.next([]);
  }

  /**
   * Reset rate limit counters
   */
  resetRateLimitInfo(): void {
    const reset: RateLimitInfo = {
      callsUsed: 0,
      callsRemaining: null,
      callsLimit: null,
      resetTime: null
    };
    this.saveRateLimitInfo(reset);
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!this.personalAccessToken;
  }

  /**
   * Get current model name
   */
  getCurrentModel(): string {
    return this.modelName;
  }

  /**
   * Get current rate limit info
   */
  getRateLimitInfo(): RateLimitInfo {
    return this.rateLimitSubject.value;
  }

  /**
   * Send a message to the AI
   */
  sendMessage(userMessage: string, conversationHistory: ChatMessage[] = []): Observable<string> {
    if (!this.personalAccessToken) {
      return throwError(() => new Error('GitHub AI service not configured. Please add your Personal Access Token.'));
    }

    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    // Build messages array for the API
    const messages = conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Add the new user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.personalAccessToken}`
    });

    const body = {
      messages: messages,
      model: this.modelName,
      temperature: 0.7,
      max_tokens: 4096,
      stream: false
    };

    return this.http.post<GitHubModelResponse>(this.apiEndpoint, body, { 
      headers,
      observe: 'response'
    }).pipe(
      tap((response: HttpResponse<GitHubModelResponse>) => {
        // Update rate limit info from response headers
        this.updateRateLimitFromHeaders(response.headers);
      }),
      map((response: HttpResponse<GitHubModelResponse>) => {
        this.loadingSubject.next(false);
        
        if (response.body && response.body.choices && response.body.choices.length > 0) {
          return response.body.choices[0].message.content;
        }
        
        throw new Error('No response from AI model');
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        
        let errorMessage = 'Failed to get AI response';
        
        if (error.status === 401) {
          errorMessage = 'Invalid or expired GitHub Personal Access Token';
        } else if (error.status === 403) {
          errorMessage = 'Access denied. Check your token permissions';
        } else if (error.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later';
          // Set rate limit to 0 to indicate exceeded state
          const current = this.rateLimitSubject.value;
          this.saveRateLimitInfo({
            ...current,
            callsRemaining: 0,
            callsLimit: current.callsLimit || 15 // Default limit if unknown
          });
          // Try to update rate limit info from headers if available
          if (error.headers) {
            this.updateRateLimitFromHeaders(error.headers, false);
          }
        } else if (error.error?.error?.message) {
          errorMessage = error.error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        this.errorSubject.next(errorMessage);
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Test the connection
   */
  testConnection(): Observable<boolean> {
    return this.sendMessage('Hello! Please respond with a simple greeting.').pipe(
      map(() => true),
      catchError(() => throwError(() => new Error('Connection test failed')))
    );
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo'
    ];
  }
}
