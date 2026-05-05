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
  filteredMessages: MailMessage[] = [];
  loading = false;
  error: string | null = null;
  isConfigured = false;

  itemsHidden = false;
  showUnreadOnly = localStorage.getItem('mail-show-unread-only') === 'true';
  expandedMessages = new Set<string>();
  private renderedBodies = new Map<string, SafeHtml>();

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
      .subscribe(messages => {
        this.messages = messages;
        this.rebuildFiltered();
      });

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

  private rebuildFiltered(): void {
    this.filteredMessages = this.showUnreadOnly
      ? this.messages.filter(m => !m.isRead)
      : this.messages;
  }

  trackById(_: number, msg: MailMessage): string { return msg.id; }

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
    this.rebuildFiltered();
    this.loadMessages();
  }

  toggleMessage(msg: MailMessage): void {
    if (this.expandedMessages.has(msg.id)) {
      this.expandedMessages.delete(msg.id);
      if (!msg.isRead) {
        msg.isRead = true; // patch immediately so the unread indicator clears
        this.rebuildFiltered();
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
    const cached = this.renderedBodies.get(msg.id);
    if (cached) return cached;

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

    // Parse the sanitized HTML and neutralize anything that can create
    // invisible overlays or bleed styles outside the widget.
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');

    // Remove <style> blocks — they can't be scoped and often set
    // body/html/div rules that affect the whole page.
    doc.querySelectorAll('style').forEach(el => el.remove());

    // Walk every element and sanitize inline styles:
    // - Remove position: fixed / absolute (invisible overlays)
    // - Remove top/left/right/bottom/z-index/width/height when paired
    //   with fixed/absolute (prevents full-viewport ghost divs)
    doc.querySelectorAll<HTMLElement>('[style]').forEach(el => {
      const s = el.style;
      const pos = s.position;
      if (pos === 'fixed' || pos === 'absolute') {
        s.removeProperty('position');
        s.removeProperty('top');
        s.removeProperty('left');
        s.removeProperty('right');
        s.removeProperty('bottom');
        s.removeProperty('z-index');
        s.removeProperty('width');
        s.removeProperty('height');
      }
      // Also strip any explicit width/height: 100vw/100vh regardless of position
      if (s.width === '100vw' || s.width === '100%') s.removeProperty('width');
      if (s.height === '100vh' || s.height === '100%') s.removeProperty('height');
    });

    // Force all links to open in a new tab
    doc.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    const result = this.sanitizer.bypassSecurityTrustHtml(doc.body.innerHTML);
    this.renderedBodies.set(msg.id, result);
    return result;
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
