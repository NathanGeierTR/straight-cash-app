import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JournalService, JournalEntry } from '../../../services/journal.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-journal-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './journal-widget.component.html',
  styleUrl: './journal-widget.component.scss'
})
export class JournalWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('entryTextarea') private entryTextarea!: ElementRef<HTMLTextAreaElement>;

  entryText = '';
  recentEntries: JournalEntry[] = [];
  isSubmitting = false;
  private sub?: Subscription;

  constructor(private journalService: JournalService) {}

  ngOnInit(): void {
    this.sub = this.journalService.entries$.subscribe(entries => {
      this.recentEntries = entries.slice(0, 3);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async submitEntry(): Promise<void> {
    if (!this.entryText.trim() || this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.journalService.addEntry(this.entryText);
      this.entryText = '';
    } finally {
      this.isSubmitting = false;
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      this.submitEntry();
    }
  }

  focusEntry(): void {
    setTimeout(() => this.entryTextarea?.nativeElement.focus(), 0);
  }
}
