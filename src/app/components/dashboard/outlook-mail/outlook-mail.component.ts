import { Component, OnInit, OnDestroy } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MicrosoftMailService, MailMessage } from '../../../services/microsoft-mail.service';
import { NavigationService } from '../../../services/navigation.service';
import { TouchTooltipDirective } from '../../../directives/touch-tooltip.directive';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-outlook-mail',
  standalone: true,
  imports: [CommonModule, TouchTooltipDirective],
  templateUrl: './outlook-mail.component.html',
  styleUrl: './outlook-mail.component.scss'
})
export class OutlookMailComponent implements OnInit, OnDestroy {
  messages: MailMessage[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;

  itemsHidden = false;
  showUnreadOnly = localStorage.getItem('mail-show-unread-only') === 'true';
  expandedMessages = new Set<string>();

  private destroy$ = new Subject<void>();

  constructor(
    private mailService: MicrosoftMailService,
    private navigationService: NavigationService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.mailService.isConfigured$
      .pipe(takeUntil(this.destroy$))
      .subscribe(configured => {
        const justConfigured = !this.isConfigured && configured;
        this.isConfigured = configured;
        if (justConfigured) {
          this.loadMessages();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.loadMessages());
        }
      });

    this.mailService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => this.messages = messages);

    this.mailService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.loading = loading);

    this.mailService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMessages(): void {
    this.mailService.fetchInbox(20, this.showUnreadOnly).subscribe();
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }

  toggleItemVisibility(): void {
    this.itemsHidden = !this.itemsHidden;
  }

  toggleShowUnreadOnly(): void {
    this.showUnreadOnly = !this.showUnreadOnly;
    localStorage.setItem('mail-show-unread-only', String(this.showUnreadOnly));
    this.loadMessages();
  }

  get filteredMessages(): MailMessage[] {
    return this.showUnreadOnly ? this.messages.filter(m => !m.isRead) : this.messages;
  }

  toggleMessage(msg: MailMessage): void {
    if (this.expandedMessages.has(msg.id)) {
      this.expandedMessages.delete(msg.id);
      if (!msg.isRead) {
        this.mailService.markAsRead(msg.id).subscribe();
      }
    } else {
      this.expandedMessages.add(msg.id);
    }
  }

  isMessageExpanded(id: string): boolean {
    return this.expandedMessages.has(id);
  }

  renderBody(msg: MailMessage): SafeHtml {
    let raw: string;
    if (!msg.body) {
      raw = msg.bodyPreview;
    } else if (msg.body.contentType === 'html') {
      raw = msg.body.content;
    } else {
      // Plain text — escape then convert newlines to <br>
      raw = msg.body.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    // Sanitize first (strips scripts, event handlers, etc.)
    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? '';

    // Parse the sanitized HTML and force all links to open in a new tab.
    // Using bypassSecurityTrustHtml here is safe because the content has
    // already been through Angular's sanitizer above.
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    doc.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    return this.sanitizer.bypassSecurityTrustHtml(doc.body.innerHTML);
  }

  formatTime(dateTimeStr: string): string {
    const date = new Date(dateTimeStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 1) {
      const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
      return `${mins}m ago`;
    }
    if (diffHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatFullTime(dateTimeStr: string): string {
    return new Date(dateTimeStr).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  get unreadCount(): number {
    return this.messages.filter(m => !m.isRead).length;
  }
}
