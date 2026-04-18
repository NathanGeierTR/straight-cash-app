import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JournalService, JournalEntry } from '../../services/journal.service';
import { NavigationService } from '../../services/navigation.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './journal.component.html',
  styleUrl: './journal.component.scss'
})
export class JournalComponent implements OnInit, OnDestroy {
  @ViewChild('newEntryTextarea') private newEntryTextarea!: ElementRef<HTMLTextAreaElement>;

  entries: JournalEntry[] = [];
  newEntryText = '';
  isSubmitting = false;
  deletingId: string | null = null;

  // Pagination
  readonly pageSize = 10;
  currentPage = 1;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.entries.length / this.pageSize));
  }

  get pagedEntries(): JournalEntry[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.entries.slice(start, start + this.pageSize);
  }

  goToPage(page: number): void {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages);
  }

  // Edit state
  editingId: string | null = null;
  editText = '';
  editDate = '';
  editTime = '';
  isSavingEdit = false;

  private sub?: Subscription;

  constructor(private journalService: JournalService, private navigationService: NavigationService) {}

  focusNewEntry(): void {
    setTimeout(() => this.newEntryTextarea?.nativeElement.focus(), 50);
  }

  ngOnInit(): void {
    this.sub = new Subscription();
    this.sub.add(
      this.journalService.entries$.subscribe(entries => {
        this.entries = entries;
      })
    );
    if (this.navigationService.pendingFocusJournalEntry) {
      this.navigationService.pendingFocusJournalEntry = false;
      this.focusNewEntry();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async submitEntry(): Promise<void> {
    if (!this.newEntryText.trim() || this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.journalService.addEntry(this.newEntryText);
      this.newEntryText = '';
      this.currentPage = 1;
    } finally {
      this.isSubmitting = false;
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      this.submitEntry();
    }
  }

  startEdit(entry: JournalEntry): void {
    this.editingId = entry.id;
    this.editText = entry.text;
    this.editDate = this.toDateInput(entry.timestamp);
    this.editTime = this.toTimeInput(entry.timestamp);
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editText = '';
    this.editDate = '';
    this.editTime = '';
  }

  async saveEdit(): Promise<void> {
    if (!this.editingId || !this.editText.trim() || this.isSavingEdit) return;
    this.isSavingEdit = true;
    try {
      const timestamp = new Date(`${this.editDate}T${this.editTime}`);
      await this.journalService.updateEntry(this.editingId, this.editText, timestamp);
      this.cancelEdit();
    } finally {
      this.isSavingEdit = false;
    }
  }

  onEditKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      this.saveEdit();
    }
    if (event.key === 'Escape') {
      this.cancelEdit();
    }
  }

  async deleteEntry(id: string): Promise<void> {
    this.deletingId = id;
    try {
      await this.journalService.deleteEntry(id);
    } finally {
      this.deletingId = null;
    }
  }

  private toDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private toTimeInput(date: Date): string {
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  }
}
