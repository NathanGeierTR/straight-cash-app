import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';

interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  publishedAt: string;
  source: {
    name: string;
  };
  urlToImage?: string;
}

interface NewsResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

@Component({
  selector: 'app-news-ticker-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './news-ticker-widget.component.html',
  styleUrl: './news-ticker-widget.component.scss'
})
export class NewsTickerWidgetComponent implements OnInit, OnDestroy {
  articles: NewsArticle[] = [];
  currentArticleIndex = 0;
  isLoading = false;
  error = '';
  
  // Configuration
  searchTopic = 'technology';
  refreshInterval = 5; // minutes
  apiKey = ''; // User will need to provide their own API key
  isConfigured = false;
  
  // Subscriptions
  private tickerSubscription?: Subscription;
  private refreshSubscription?: Subscription;

  // Popular topics for quick selection
  popularTopics = [
    'technology', 'programming', 'software development', 
    'artificial intelligence', 'cybersecurity', 'cloud computing',
    'javascript', 'angular', 'react', 'web development'
  ];

  constructor(private http: HttpClient) {
    // Load configuration from localStorage
    const savedTopic = localStorage.getItem('news-ticker-topic');
    const savedApiKey = localStorage.getItem('news-ticker-api-key');
    const savedInterval = localStorage.getItem('news-ticker-interval');
    
    if (savedTopic) this.searchTopic = savedTopic;
    if (savedApiKey) {
      this.apiKey = savedApiKey;
      this.isConfigured = true;
    }
    if (savedInterval) this.refreshInterval = parseInt(savedInterval, 10);
  }

  ngOnInit() {
    if (this.isConfigured) {
      this.loadNews();
      this.startAutoRefresh();
    }
  }

  ngOnDestroy() {
    this.stopTicker();
    this.stopAutoRefresh();
  }

  saveConfiguration() {
    if (this.apiKey.trim()) {
      localStorage.setItem('news-ticker-api-key', this.apiKey);
      localStorage.setItem('news-ticker-topic', this.searchTopic);
      localStorage.setItem('news-ticker-interval', this.refreshInterval.toString());
      this.isConfigured = true;
      this.loadNews();
      this.startAutoRefresh();
    }
  }

  clearConfiguration() {
    localStorage.removeItem('news-ticker-api-key');
    localStorage.removeItem('news-ticker-topic');
    localStorage.removeItem('news-ticker-interval');
    this.apiKey = '';
    this.isConfigured = false;
    this.articles = [];
    this.stopTicker();
    this.stopAutoRefresh();
  }

  selectTopic(topic: string) {
    this.searchTopic = topic;
  }

  loadNews() {
    if (!this.apiKey || !this.searchTopic) return;
    
    this.isLoading = true;
    this.error = '';
    
    // Using NewsAPI.org - you can replace with other news APIs
    const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(this.searchTopic)}&sortBy=publishedAt&pageSize=20&apiKey=${this.apiKey}`;
    
    this.http.get<NewsResponse>(apiUrl).subscribe({
      next: (response) => {
        this.articles = response.articles.filter(article => 
          article.title && article.title !== '[Removed]'
        );
        this.isLoading = false;
        this.currentArticleIndex = 0;
        this.startTicker();
        
        // Save successful configuration
        localStorage.setItem('news-ticker-topic', this.searchTopic);
      },
      error: (error) => {
        this.error = this.getErrorMessage(error);
        this.isLoading = false;
        console.error('News API Error:', error);
      }
    });
  }

  private getErrorMessage(error: any): string {
    if (error.status === 401) {
      return 'Invalid API key. Please check your NewsAPI key.';
    } else if (error.status === 426) {
      return 'API upgrade required. Free tier limits exceeded.';
    } else if (error.status === 429) {
      return 'Rate limit exceeded. Please wait before making more requests.';
    } else if (error.status === 0) {
      return 'CORS error. API might not support browser requests.';
    }
    return `Error loading news: ${error.message || 'Unknown error'}`;
  }

  startTicker() {
    this.stopTicker();
    if (this.articles.length > 1) {
      this.tickerSubscription = interval(6000).subscribe(() => {
        this.currentArticleIndex = (this.currentArticleIndex + 1) % this.articles.length;
      });
    }
  }

  stopTicker() {
    if (this.tickerSubscription) {
      this.tickerSubscription.unsubscribe();
      this.tickerSubscription = undefined;
    }
  }

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.refreshSubscription = interval(this.refreshInterval * 60 * 1000).subscribe(() => {
      this.loadNews();
    });
  }

  stopAutoRefresh() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }

  refreshNews() {
    this.loadNews();
  }

  getCurrentArticle(): NewsArticle | null {
    return this.articles.length > 0 ? this.articles[this.currentArticleIndex] : null;
  }

  openArticle(article: NewsArticle) {
    window.open(article.url, '_blank');
  }

  getTimeAgo(publishedAt: string): string {
    const now = new Date();
    const published = new Date(publishedAt);
    const diffMs = now.getTime() - published.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else {
      return 'Just now';
    }
  }
}