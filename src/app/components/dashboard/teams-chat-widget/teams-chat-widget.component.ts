import { Component, OnInit, OnDestroy } from '@angular/core';
import { SecurityContext } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MicrosoftTeamsService, TeamsChat, TeamsChannel, TeamsChatMessage } from '../../../services/microsoft-teams.service';
import { NavigationService } from '../../../services/navigation.service';
import { TouchTooltipDirective } from '../../../directives/touch-tooltip.directive';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-teams-chat-widget',
  standalone: true,
  imports: [CommonModule, TouchTooltipDirective],
  templateUrl: './teams-chat-widget.component.html',
  styleUrl: './teams-chat-widget.component.scss'
})
export class TeamsChatWidgetComponent implements OnInit, OnDestroy {
  chats: TeamsChat[] = [];
  channels: TeamsChannel[] = [];
  loading = false;
  channelsLoading = false;
  error: string | null = null;
  channelsError: string | null = null;
  isConfigured = false;
  itemsHidden = false;
  activeView: 'chats' | 'channels' = 'chats';
  showUnreadOnly = localStorage.getItem('teams-show-unread-only') !== 'false';
  expandedChats = new Set<string>();
  expandedChannels = new Set<string>();
  loadingMessages = new Set<string>();
  myUserId: string | null = null;
  showChannelSettings = false;
  /** True once the user has confirmed their channel filter at least once. */
  channelsConfigured = localStorage.getItem('teams-channels-configured') === 'true';
  /** Record<teamId, true> for hidden teams. New object reference on each toggle so Angular detects changes. */
  hiddenTeamIds: Record<string, true> = this.loadHiddenTeamIds();
  /** Record<'teamId:channelId', true> for individually hidden channels. */
  hiddenChannelKeys: Record<string, true> = this.loadHiddenChannelKeys();
  /** Which team rows are expanded in the settings panel. */
  expandedSettingsTeams = new Set<string>();
  private renderedBodies = new Map<string, SafeHtml>();

  private loadHiddenTeamIds(): Record<string, true> {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('teams-hidden-team-ids') ?? '[]');
      return Object.fromEntries(ids.map(id => [id, true as const]));
    } catch { return {}; }
  }

  private saveHiddenTeamIds(): void {
    localStorage.setItem('teams-hidden-team-ids', JSON.stringify(Object.keys(this.hiddenTeamIds)));
  }

  private loadHiddenChannelKeys(): Record<string, true> {
    try {
      const keys: string[] = JSON.parse(localStorage.getItem('teams-hidden-channel-keys') ?? '[]');
      return Object.fromEntries(keys.map(k => [k, true as const]));
    } catch { return {}; }
  }

  private saveHiddenChannelKeys(): void {
    localStorage.setItem('teams-hidden-channel-keys', JSON.stringify(Object.keys(this.hiddenChannelKeys)));
  }

  private channelKey(teamId: string, channelId: string): string {
    return `${teamId}:${channelId}`;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private teamsService: MicrosoftTeamsService,
    private navigationService: NavigationService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.teamsService.currentUserId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => this.myUserId = id);

    this.teamsService.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(authenticated => {
        const justConfigured = !this.isConfigured && authenticated;
        this.isConfigured = authenticated;
        if (justConfigured) {
          this.loadChats();
          this.loadChannels();
          interval(5 * 60 * 1000)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => { this.loadChats(); this.loadChannels(); });
        }
        if (!authenticated) {
          this.chats = [];
          this.channels = [];
        }
      });

    this.teamsService.chats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(chats => this.chats = chats);

    this.teamsService.chatsLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.loading = loading);

    this.teamsService.chatsError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.error = error);

    this.teamsService.channels$
      .pipe(takeUntil(this.destroy$))
      .subscribe(channels => {
        this.channels = channels;
        this.rebuildTeamGroups();
        // Auto-open team filter on first load if user hasn't configured yet
        if (channels.length > 0 && !this.channelsConfigured && this.activeView === 'channels') {
          this.showChannelSettings = true;
        }
      });

    this.teamsService.channelsLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => this.channelsLoading = loading);

    this.teamsService.channelsError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => this.channelsError = error);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadChats(): void {
    this.teamsService.fetchChats(50).subscribe();
  }

  loadChannels(): void {
    this.teamsService.fetchChannels().subscribe();
  }

  switchView(view: 'chats' | 'channels'): void {
    this.activeView = view;
    // Auto-open the team filter on first visit to channels tab
    if (view === 'channels' && !this.channelsConfigured && this.allTeamGroups.length > 0) {
      this.showChannelSettings = true;
    }
  }

  get filteredChats(): TeamsChat[] {
    if (this.showUnreadOnly) {
      return this.chats.filter(c => (c.viewpoint?.unreadMessageCount ?? 0) > 0);
    }
    return this.chats;
  }

  get unreadCount(): number {
    return this.chats.filter(c => (c.viewpoint?.unreadMessageCount ?? 0) > 0).length;
  }

  toggleShowUnreadOnly(): void {
    this.showUnreadOnly = !this.showUnreadOnly;
    localStorage.setItem('teams-show-unread-only', String(this.showUnreadOnly));
  }

  toggleItemVisibility(): void {
    this.itemsHidden = !this.itemsHidden;
  }

  toggleChat(chat: TeamsChat): void {
    if (this.expandedChats.has(chat.id)) {
      this.expandedChats.delete(chat.id);
    } else {
      this.expandedChats.add(chat.id);
      // Lazy-load messages if not already fetched
      if (!chat.messages) {
        this.loadingMessages.add(chat.id);
        this.teamsService.fetchChatMessages(chat.id, 20).subscribe(() => {
          this.loadingMessages.delete(chat.id);
        });
      } else {
        // Invalidate render cache so fresh content is re-computed
        chat.messages.forEach(m => this.renderedBodies.delete(m.id));
      }
    }
  }

  isChatExpanded(id: string): boolean {
    return this.expandedChats.has(id);
  }

  isLoadingMessages(id: string): boolean {
    return this.loadingMessages.has(id);
  }

  // ─── Channel interactions ──────────────────────────────────────────────────

  /** Cached — rebuilt only when channels or hiddenTeamIds change. */
  allTeamGroups: Array<{ teamId: string; teamName: string; channels: TeamsChannel[] }> = [];
  channelsByTeam: Array<{ teamId: string; teamName: string; channels: TeamsChannel[] }> = [];

  private rebuildTeamGroups(): void {
    const map = new Map<string, { teamId: string; teamName: string; channels: TeamsChannel[] }>();
    for (const ch of this.channels) {
      if (!map.has(ch.teamId)) {
        map.set(ch.teamId, { teamId: ch.teamId, teamName: ch.teamDisplayName, channels: [] });
      }
      map.get(ch.teamId)!.channels.push(ch);
    }
    this.allTeamGroups = Array.from(map.values());
    // channelsByTeam: skip hidden teams, skip hidden individual channels
    this.channelsByTeam = this.allTeamGroups
      .filter(g => !this.hiddenTeamIds[g.teamId])
      .map(g => ({
        ...g,
        channels: g.channels.filter(ch => !this.hiddenChannelKeys[this.channelKey(g.teamId, ch.id)])
      }))
      .filter(g => g.channels.length > 0);
  }

  isTeamVisible(teamId: string): boolean {
    return !this.hiddenTeamIds[teamId];
  }

  isChannelVisible(teamId: string, channelId: string): boolean {
    return !this.hiddenChannelKeys[this.channelKey(teamId, channelId)];
  }

  /** True if every channel in a team is visible (used for team checkbox state). */
  isTeamFullySelected(group: { teamId: string; channels: TeamsChannel[] }): boolean {
    return !this.hiddenTeamIds[group.teamId] &&
      group.channels.every(ch => !this.hiddenChannelKeys[this.channelKey(group.teamId, ch.id)]);
  }

  /** True if some but not all channels in a team are visible. */
  isTeamPartiallySelected(group: { teamId: string; channels: TeamsChannel[] }): boolean {
    if (this.hiddenTeamIds[group.teamId]) return false;
    const hiddenCount = group.channels.filter(ch => this.hiddenChannelKeys[this.channelKey(group.teamId, ch.id)]).length;
    return hiddenCount > 0 && hiddenCount < group.channels.length;
  }

  get allTeamsSelected(): boolean {
    return this.allTeamGroups.length > 0 &&
      this.allTeamGroups.every(g =>
        !this.hiddenTeamIds[g.teamId] &&
        g.channels.every(ch => !this.hiddenChannelKeys[this.channelKey(g.teamId, ch.id)])
      );
  }

  get someTeamsSelected(): boolean {
    if (this.allTeamsSelected) return false;
    return this.allTeamGroups.some(g =>
      !this.hiddenTeamIds[g.teamId] &&
      g.channels.some(ch => !this.hiddenChannelKeys[this.channelKey(g.teamId, ch.id)])
    );
  }

  toggleAllTeams(): void {
    if (this.allTeamsSelected) {
      this.hiddenTeamIds = Object.fromEntries(this.allTeamGroups.map(g => [g.teamId, true as const])) as Record<string, true>;
      this.hiddenChannelKeys = {};
    } else {
      this.hiddenTeamIds = {};
      this.hiddenChannelKeys = {};
    }
    this.saveHiddenTeamIds();
    this.saveHiddenChannelKeys();
    this.rebuildTeamGroups();
  }

  toggleTeamVisibility(group: { teamId: string; channels: TeamsChannel[] }): void {
    if (this.isTeamFullySelected(group)) {
      // Fully selected → hide entire team
      this.hiddenTeamIds = { ...this.hiddenTeamIds, [group.teamId]: true };
    } else if (this.hiddenTeamIds[group.teamId]) {
      // Team hidden → show team + clear any per-channel hides for it
      const { [group.teamId]: _, ...rest } = this.hiddenTeamIds;
      this.hiddenTeamIds = rest as Record<string, true>;
      // Also clear individual channel hides under this team
      const newChannelKeys = { ...this.hiddenChannelKeys };
      group.channels.forEach(ch => delete newChannelKeys[this.channelKey(group.teamId, ch.id)]);
      this.hiddenChannelKeys = newChannelKeys;
      this.saveHiddenChannelKeys();
    } else {
      // Partially selected → show all channels in team
      const newChannelKeys = { ...this.hiddenChannelKeys };
      group.channels.forEach(ch => delete newChannelKeys[this.channelKey(group.teamId, ch.id)]);
      this.hiddenChannelKeys = newChannelKeys;
      this.saveHiddenChannelKeys();
    }
    this.saveHiddenTeamIds();
    this.rebuildTeamGroups();
  }

  toggleChannelVisibility(teamId: string, ch: TeamsChannel): void {
    const key = this.channelKey(teamId, ch.id);
    if (this.hiddenChannelKeys[key]) {
      const { [key]: _, ...rest } = this.hiddenChannelKeys;
      this.hiddenChannelKeys = rest as Record<string, true>;
    } else {
      this.hiddenChannelKeys = { ...this.hiddenChannelKeys, [key]: true };
    }
    this.saveHiddenChannelKeys();
    this.rebuildTeamGroups();
  }

  toggleSettingsTeamExpanded(teamId: string): void {
    if (this.expandedSettingsTeams.has(teamId)) {
      this.expandedSettingsTeams.delete(teamId);
    } else {
      this.expandedSettingsTeams.add(teamId);
    }
    // force reference change for change detection
    this.expandedSettingsTeams = new Set(this.expandedSettingsTeams);
  }

  isSettingsTeamExpanded(teamId: string): boolean {
    return this.expandedSettingsTeams.has(teamId);
  }

  toggleChannelSettings(): void {
    this.showChannelSettings = !this.showChannelSettings;
  }

  confirmChannelSettings(): void {
    this.showChannelSettings = false;
    this.channelsConfigured = true;
    localStorage.setItem('teams-channels-configured', 'true');
  }

  get unreadChannelCount(): number {
    return this.channels.filter(ch => this.isChannelUnread(ch)).length;
  }

  private channelLastReadKey(ch: TeamsChannel): string {
    return `teams-ch-lastread-${ch.teamId}-${ch.id}`;
  }

  isChannelUnread(ch: TeamsChannel): boolean {
    if (!ch.messages?.length) return false;
    const lastRead = localStorage.getItem(this.channelLastReadKey(ch));
    if (!lastRead) return true; // never opened = treat as unread
    return new Date(ch.messages[0].createdDateTime) > new Date(lastRead);
  }

  toggleChannel(ch: TeamsChannel): void {
    const key = `${ch.teamId}:${ch.id}`;
    if (this.expandedChannels.has(key)) {
      this.expandedChannels.delete(key);
    } else {
      this.expandedChannels.add(key);
      if (!ch.messages) {
        this.loadingMessages.add(key);
        this.teamsService.fetchChannelMessages(ch.teamId, ch.id, 20).subscribe(() => {
          this.loadingMessages.delete(key);
          // Mark as read once messages are loaded
          localStorage.setItem(this.channelLastReadKey(ch), new Date().toISOString());
        });
      } else {
        ch.messages.forEach(m => this.renderedBodies.delete(m.id));
        localStorage.setItem(this.channelLastReadKey(ch), new Date().toISOString());
      }
    }
  }

  isChannelExpanded(ch: TeamsChannel): boolean {
    return this.expandedChannels.has(`${ch.teamId}:${ch.id}`);
  }

  isChannelLoadingMessages(ch: TeamsChannel): boolean {
    return this.loadingMessages.has(`${ch.teamId}:${ch.id}`);
  }

  retryChannelMessages(ch: TeamsChannel): void {
    const key = `${ch.teamId}:${ch.id}`;
    this.loadingMessages.add(key);
    this.teamsService.fetchChannelMessages(ch.teamId, ch.id, 20).subscribe(() => {
      this.loadingMessages.delete(key);
    });
  }

  openChannelInTeams(ch: TeamsChannel): void {
    const url = `https://teams.microsoft.com/l/channel/${encodeURIComponent(ch.id)}/${encodeURIComponent(ch.displayName)}?groupId=${encodeURIComponent(ch.teamId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  goToConnections(): void {
    this.navigationService.navigateTo('connections');
  }

  openInTeams(chat: TeamsChat): void {
    // Deep link to Teams web client
    const url = `https://teams.microsoft.com/l/chat/${encodeURIComponent(chat.id)}/0`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Display name: other person for 1:1, topic for group, or member list fallback. */
  getChatName(chat: TeamsChat): string {
    if (chat.chatType === 'oneOnOne') {
      const other = chat.members.find(m => m.userId !== this.myUserId && m.displayName);
      return other?.displayName ?? chat.members.find(m => m.displayName)?.displayName ?? 'Direct Message';
    }
    if (chat.topic) return chat.topic;
    const names = chat.members
      .filter(m => m.displayName && m.userId !== this.myUserId)
      .map(m => m.displayName!)
      .slice(0, 3);
    return names.length ? names.join(', ') + (chat.members.length - 1 > 3 ? ` +${chat.members.length - 1 - 3}` : '') : 'Group Chat';
  }

  getChatIcon(chat: TeamsChat): string {
    if (chat.chatType === 'oneOnOne') return 'fa-user';
    if (chat.chatType === 'meeting') return 'fa-video';
    return 'fa-users';
  }

  getLastMessagePreview(chat: TeamsChat): string {
    const lm = chat.lastMessagePreview;
    if (!lm || lm.isDeleted) return '';
    const raw = lm.body.contentType === 'html'
      ? new DOMParser().parseFromString(lm.body.content, 'text/html').body.textContent ?? ''
      : lm.body.content;
    return raw.trim().slice(0, 80) + (raw.trim().length > 80 ? '…' : '');
  }

  getLastChannelMessagePreview(ch: TeamsChannel): string {
    if (!ch.messages?.length) return '';
    const msg = ch.messages[0];
    const raw = msg.body.contentType === 'html'
      ? new DOMParser().parseFromString(msg.body.content, 'text/html').body.textContent ?? ''
      : msg.body.content;
    return raw.trim().slice(0, 80) + (raw.trim().length > 80 ? '…' : '');
  }

  renderMessageBody(msg: TeamsChatMessage): SafeHtml {
    const cached = this.renderedBodies.get(msg.id);
    if (cached) return cached;

    let raw: string;
    if (msg.body.contentType === 'html') {
      // Pre-clean Teams-specific tags that Angular's sanitizer would strip with warnings:
      // <at> = @mention, <attachment> = file card, <emoji> = Teams emoji
      // Replace <at> with its text content so mention names are preserved.
      raw = msg.body.content
        .replace(/<at[^>]*>(.*?)<\/at>/gis, '<strong>@$1</strong>')
        .replace(/<attachment[^>]*>.*?<\/attachment>/gis, '')
        .replace(/<emoji[^>]*>.*?<\/emoji>/gis, '')
        .replace(/<\/?(ms-\w+|x-\w+|t-\w+|systemEventMessage|eventItemHeader)[^>]*>/gis, '');
    } else {
      raw = msg.body.content
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, raw) ?? '';
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    doc.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    const result = this.sanitizer.bypassSecurityTrustHtml(doc.body.innerHTML);
    this.renderedBodies.set(msg.id, result);
    return result;
  }

  getSenderName(msg: TeamsChatMessage): string {
    return msg.from?.user?.displayName ?? msg.from?.application?.displayName ?? 'Unknown';
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
}
