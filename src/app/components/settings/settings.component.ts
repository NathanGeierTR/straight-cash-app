import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserProfileService } from '../../services/user-profile.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit, OnDestroy {
  jobDescription = '';
  saving = false;
  saved = false;
  saveError: string | null = null;

  private sub = new Subscription();

  constructor(private userProfileService: UserProfileService) {}

  ngOnInit(): void {
    this.sub.add(
      this.userProfileService.profile$.subscribe(profile => {
        this.jobDescription = profile.jobDescription;
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  async save(): Promise<void> {
    this.saving = true;
    this.saved = false;
    this.saveError = null;
    try {
      await this.userProfileService.saveProfile({ jobDescription: this.jobDescription });
      this.saved = true;
      setTimeout(() => (this.saved = false), 3000);
    } catch (e: any) {
      this.saveError = e?.message ?? 'Failed to save settings.';
    } finally {
      this.saving = false;
    }
  }
}
