import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafePipe } from '../../../pipes/safe.pipe';

@Component({
  selector: 'app-open-arena-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SafePipe],
  templateUrl: './open-arena-chat.component.html',
  styleUrl: './open-arena-chat.component.scss'
})
export class OpenArenaChatComponent {
  chatUrl: string = '';
  isUrlSet: boolean = false;
  showFallback: boolean = false;
  iframeUrl: string = 'https://dataandanalytics.int.thomsonreuters.com/ai-platform/ai-experiences/use/27bb41d4-140b-4f8d-9179-bc57f3efbd62';
  
  constructor() {
    // Check if URL is stored in localStorage
    const storedUrl = localStorage.getItem('open-arena-chat-url');
    if (storedUrl) {
      this.chatUrl = storedUrl;
      this.isUrlSet = true;
    }
    
    // Check if user previously chose to show fallback
    const fallbackPreference = localStorage.getItem('open-arena-show-fallback');
    this.showFallback = fallbackPreference === 'true';
    
    // Auto-detect iframe loading issues after a delay
    setTimeout(() => {
      if (!this.showFallback) {
        this.checkIframeLoad();
      }
    }, 3000);
  }
  
  checkIframeLoad() {
    // After 3 seconds, assume iframe didn't load properly and show fallback
    // This is a heuristic since we can't reliably detect X-Frame-Options errors
    this.showFallback = true;
    localStorage.setItem('open-arena-show-fallback', 'true');
  }
  
  openInNewTab() {
    window.open(this.iframeUrl, '_blank');
  }
  
  refreshIframe() {
    this.showFallback = false;
    localStorage.setItem('open-arena-show-fallback', 'false');
  }

  setChatUrl() {
    if (this.chatUrl.trim()) {
      localStorage.setItem('open-arena-chat-url', this.chatUrl);
      this.isUrlSet = true;
    }
  }

  clearUrl() {
    this.chatUrl = '';
    this.isUrlSet = false;
    localStorage.removeItem('open-arena-chat-url');
  }

  editUrl() {
    this.isUrlSet = false;
  }
}