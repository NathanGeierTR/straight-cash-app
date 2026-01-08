import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CoworkerService, Coworker } from '../../../services/coworker.service';
import { MicrosoftTeamsService } from '../../../services/microsoft-teams.service';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-coworker-timezones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './coworker-timezones.component.html',
  styleUrls: ['./coworker-timezones.component.scss']
})
export class CoworkerTimezonesComponent implements OnInit, OnDestroy {
  coworkers: Coworker[] = [];
  showAddForm = false;
  editingCoworkerId: number | null = null;

  // Form data
  newCoworker = {
    name: '',
    role: '',
    location: '',
    timezoneOffset: 0,
    selectedCity: '',  // Will be set to user's timezone on init
    email: ''
  };

  editingCoworker = {
    name: '',
    role: '',
    location: '',
    timezoneOffset: 0,
    selectedCity: '',  // Will be set to user's timezone on init
    email: ''
  };

  teamsConnected = false;
  showTeamsSetup = false;
  teamsAccessToken = '';
  
  // Store the user's current timezone
  userTimezone = 'America/New_York';

  // Replace the getter with a regular property
  timezoneOffsets: Array<{
    label: string;
    value: number;
    city: string;
    timezone: string;
    utcOffset: number;
  }> = [];

  cityTimezones: Array<{
    name: string;
    timezone: string;
  }> = [
    { name: 'Los Angeles, USA', timezone: 'America/Los_Angeles' },
    { name: 'Denver, USA', timezone: 'America/Denver' },
    { name: 'Minneapolis, USA', timezone: 'America/Chicago' },
    { name: 'Toronto, Canada', timezone: 'America/Toronto' },
    { name: 'Ann Arbor, USA', timezone: 'America/Detroit' },
    { name: 'New York, USA', timezone: 'America/New_York' },
    { name: 'London, UK', timezone: 'Europe/London' },
    { name: 'Paris, France', timezone: 'Europe/Paris' },
    { name: 'Minsk, Belarus', timezone: 'Europe/Minsk' },
    { name: 'Tokyo, Japan', timezone: 'Asia/Tokyo' },
    { name: 'Sydney, Australia', timezone: 'Australia/Sydney' },
    { name: 'Dubai, UAE', timezone: 'Asia/Dubai' },
    { name: 'Singapore', timezone: 'Asia/Singapore' },
    { name: 'Mumbai, India', timezone: 'Asia/Kolkata' },
  ];

  // Add this method to calculate timezone offsets
  private calculateTimezoneOffsets(): void {
    // Get user's current timezone offset in hours (negative for west of UTC, positive for east)
    const userOffset = -new Date().getTimezoneOffset() / 60;
    
    // Base timezone list with their UTC offsets
    const baseTimezones = [
      { utcOffset: -12, city: 'Baker Island', timezone: 'Etc/GMT+12' },
      { utcOffset: -11, city: 'Pago Pago', timezone: 'Pacific/Pago_Pago' },
      { utcOffset: -10, city: 'Honolulu', timezone: 'Pacific/Honolulu' },
      { utcOffset: -9, city: 'Anchorage', timezone: 'America/Anchorage' },
      { utcOffset: -8, city: 'Los Angeles', timezone: 'America/Los_Angeles' },
      { utcOffset: -7, city: 'Denver', timezone: 'America/Denver' },
      { utcOffset: -6, city: 'Chicago', timezone: 'America/Chicago' },
      { utcOffset: -5, city: 'New York', timezone: 'America/New_York' },
      { utcOffset: -4, city: 'Halifax', timezone: 'America/Halifax' },
      { utcOffset: -3, city: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires' },
      { utcOffset: -2, city: 'South Georgia', timezone: 'Atlantic/South_Georgia' },
      { utcOffset: -1, city: 'Azores', timezone: 'Atlantic/Azores' },
      { utcOffset: 0, city: 'London', timezone: 'Europe/London' },
      { utcOffset: 1, city: 'Paris', timezone: 'Europe/Paris' },
      { utcOffset: 2, city: 'Cairo', timezone: 'Africa/Cairo' },
      { utcOffset: 3, city: 'Moscow', timezone: 'Europe/Moscow' },
      { utcOffset: 4, city: 'Dubai', timezone: 'Asia/Dubai' },
      { utcOffset: 5, city: 'Karachi', timezone: 'Asia/Karachi' },
      { utcOffset: 5.5, city: 'Mumbai', timezone: 'Asia/Kolkata' },
      { utcOffset: 6, city: 'Dhaka', timezone: 'Asia/Dhaka' },
      { utcOffset: 7, city: 'Bangkok', timezone: 'Asia/Bangkok' },
      { utcOffset: 8, city: 'Singapore', timezone: 'Asia/Singapore' },
      { utcOffset: 9, city: 'Tokyo', timezone: 'Asia/Tokyo' },
      { utcOffset: 10, city: 'Sydney', timezone: 'Australia/Sydney' },
      { utcOffset: 11, city: 'Guadalcanal', timezone: 'Pacific/Guadalcanal' },
      { utcOffset: 12, city: 'Auckland', timezone: 'Pacific/Auckland' },
      { utcOffset: 13, city: 'Nuku\'alofa', timezone: 'Pacific/Tongatapu' },
      { utcOffset: 14, city: 'Kiritimati', timezone: 'Pacific/Kiritimati' }
    ];
    
    // Calculate relative offsets and create labels
    this.timezoneOffsets = baseTimezones.map(tz => {
      const relativeOffset = tz.utcOffset - userOffset;
      const value = relativeOffset;
      
      let label: string;
      if (relativeOffset === 0) {
        label = `+0 hours (${tz.city}) - Your timezone`;
      } else if (relativeOffset > 0) {
        label = `+${relativeOffset} hour${relativeOffset !== 1 ? 's' : ''} (${tz.city})`;
      } else {
        label = `${relativeOffset} hour${relativeOffset !== -1 ? 's' : ''} (${tz.city})`;
      }
      
      return {
        label,
        value,
        city: tz.city,
        timezone: tz.timezone,
        utcOffset: tz.utcOffset
      };
    }).sort((a, b) => a.value - b.value); // Sort by relative offset
  }

  private destroy$ = new Subject<void>();
  private updateInterval$ = new Subject<void>();

  constructor(
    private coworkerService: CoworkerService,
    private teamsService: MicrosoftTeamsService
  ) {}

  ngOnInit(): void {
    // Detect user's timezone
    this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Set default city for forms
    this.newCoworker.selectedCity = this.userTimezone;
    this.editingCoworker.selectedCity = this.userTimezone;
    
    // Calculate timezone offsets once on init
    this.calculateTimezoneOffsets();
    
    this.coworkerService.coworkers$
      .pipe(takeUntil(this.destroy$))
      .subscribe(coworkers => {
        this.coworkers = coworkers;
      });

    // Check if Teams is connected
    this.teamsService.isAuthenticated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isAuth => {
        this.teamsConnected = isAuth;
        if (isAuth) {
          this.refreshTeamsPresence();
        }
      });

    // Update times every minute
    interval(60000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.coworkers = [...this.coworkers]; // Trigger change detection
      });

    // Refresh Teams presence every 10 minutes if connected (changed from 30 seconds)
    interval(600000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.teamsConnected) {
          this.refreshTeamsPresence();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addCoworker(): void {
    const email = this.newCoworker.email.trim();
    
    if (!email) {
      alert('Email address is required');
      return;
    }
    
    if (!this.teamsConnected) {
      alert('Please connect to Microsoft Teams first to add coworkers by email');
      return;
    }
    
    // Determine which selection method to use
    // If city is not the default, prefer city selection
    let timezone: string | undefined;
    let location: string;
    
    if (this.newCoworker.selectedCity !== this.userTimezone || this.newCoworker.timezoneOffset === 0) {
      // Prefer city selection if it's been changed from default
      const selectedCity = this.cityTimezones.find(c => c.timezone === this.newCoworker.selectedCity);
      timezone = selectedCity?.timezone;
      location = selectedCity?.name.split(',')[0] || 'Unknown';
    } else {
      // Use offset selection
      const selectedOffset = this.timezoneOffsets.find(tz => tz.value === this.newCoworker.timezoneOffset);
      timezone = selectedOffset?.timezone;
      location = selectedOffset?.city || 'Unknown';
    }
    
    console.log('Timezone:', timezone);
    console.log('Location:', location);
    
    // Fetch user data from Teams
    this.teamsService.getUserProfile(email)
      .subscribe({
        next: (profile) => {
          console.log('Found user:', profile);
          
          const coworkerData: any = {
            name: profile.displayName || email,
            role: profile.jobTitle,
            location: location,
            timezone: timezone,
            email: email
          };
          
          console.log('Adding coworker with data:', coworkerData);
          
          this.coworkerService.addCoworker(coworkerData);
          
          setTimeout(() => {
            const coworker = this.coworkers.find(c => c.email === email);
            if (coworker) {
              this.fetchUserPhoto(email, coworker.id);
            }
          }, 100);
          
          this.resetForm();
          this.showAddForm = false;
        },
        error: (error) => {
          console.error('User lookup failed:', error);
          if (error.status === 404) {
            alert('❌ User not found. Please check the email address.');
          } else {
            alert(`❌ Error: ${error.error?.error?.message || error.message}`);
          }
        }
      });
  }

  startEdit(coworker: Coworker): void {
    this.editingCoworkerId = coworker.id;
    
    // Find matching offset and city from timezone
    const matchingOffset = this.timezoneOffsets.find(tz => tz.timezone === coworker.timezone);
    const matchingCity = this.cityTimezones.find(city => city.timezone === coworker.timezone);
    
    this.editingCoworker = {
      name: coworker.name,
      role: coworker.role || '',
      location: coworker.location,
      timezoneOffset: matchingOffset?.value || 0,
      selectedCity: matchingCity?.timezone || this.userTimezone,
      email: coworker.email || ''
    };
  }

  saveEdit(id: number): void {
    if (this.editingCoworker.name.trim()) {
      // Find the original coworker to compare timezone changes
      const originalCoworker = this.coworkers.find(c => c.id === id);
      const originalCity = this.cityTimezones.find(city => city.timezone === originalCoworker?.timezone);
      const originalOffset = this.timezoneOffsets.find(tz => tz.timezone === originalCoworker?.timezone);
      
      // Determine which selection method to use
      let timezone: string | undefined;
      let location: string;
      
      // If city has changed from original, prefer city selection
      if (this.editingCoworker.selectedCity !== (originalCity?.timezone || 'America/New_York')) {
        const selectedCity = this.cityTimezones.find(c => c.timezone === this.editingCoworker.selectedCity);
        timezone = selectedCity?.timezone;
        location = selectedCity?.name.split(',')[0] || 'Unknown';
      } else if (this.editingCoworker.timezoneOffset !== (originalOffset?.value || 0)) {
        // Use offset selection if it's been changed
        const selectedOffset = this.timezoneOffsets.find(tz => tz.value === this.editingCoworker.timezoneOffset);
        timezone = selectedOffset?.timezone;
        location = selectedOffset?.city || 'Unknown';
      } else {
        // No change detected, use offset
        const selectedOffset = this.timezoneOffsets.find(tz => tz.value === this.editingCoworker.timezoneOffset);
        timezone = selectedOffset?.timezone;
        location = selectedOffset?.city || 'Unknown';
      }
      
      this.coworkerService.updateCoworker(id, {
        name: this.editingCoworker.name.trim(),
        role: this.editingCoworker.role.trim() || undefined,
        location: location,
        timezone: timezone,
        email: this.editingCoworker.email.trim() || undefined
      });
      this.cancelEdit();
    }
  }

  cancelEdit(): void {
    this.editingCoworkerId = null;
  }

  deleteCoworker(id: number): void {
    if (confirm('Are you sure you want to remove this coworker?')) {
      this.coworkerService.deleteCoworker(id);
    }
  }

  getCurrentTime(timezone: string | undefined): string {
    if (!timezone) {
      return 'N/A';
    }
    const time = this.coworkerService.getCurrentTime(timezone);
    const timeString = time.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    // Convert AM/PM to lowercase am/pm
    return timeString.replace(/AM|PM/g, match => match.toLowerCase());
  }

  getTimeProgress(timezone: string | undefined): number {
    if (!timezone) {
      return 0;
    }
    return this.coworkerService.getTimeProgress(timezone);
  }

  getStatusText(timezone: string | undefined): string {
    if (!timezone) {
      return 'Unknown';
    }
    const time = this.coworkerService.getCurrentTime(timezone);
    const hours = time.getHours();

    if (hours >= 6 && hours < 9) return 'Morning';
    if (hours >= 9 && hours < 17) return 'Office hours';
    if (hours >= 17 && hours < 23) return 'Evening';
    return 'Sleeping';
  }

  getDayOrNight(timezone: string | undefined): 'day' | 'night' {
    if (!timezone) {
      return 'day'; // Default to day icon if no timezone
    }
    const time = this.coworkerService.getCurrentTime(timezone);
    const hours = time.getHours();
    return hours >= 6 && hours < 18 ? 'day' : 'night';
}

  private resetForm(): void {
    this.newCoworker = {
      name: '',
      role: '',
      location: '',
      timezoneOffset: 0,
      selectedCity: this.userTimezone,
      email: ''
    };
  }

  moveCoworkerUp(index: number): void {
        if (index > 0) {
            const coworkers = [...this.coworkers];
            [coworkers[index - 1], coworkers[index]] = [coworkers[index], coworkers[index - 1]];
            this.coworkerService.reorderCoworkers(coworkers);
        }
    }

    moveCoworkerDown(index: number): void {
        if (index < this.coworkers.length - 1) {
            const coworkers = [...this.coworkers];
            [coworkers[index], coworkers[index + 1]] = [coworkers[index + 1], coworkers[index]];
            this.coworkerService.reorderCoworkers(coworkers);
        }
    }

  exportCoworkers(): void {
    const json = this.coworkerService.exportToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coworkers-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  importCoworkers(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          this.coworkerService.importFromJson(json);
          alert('Coworkers imported successfully!');
        } catch (error) {
          alert('Error importing coworkers. Please check the file format.');
        }
      };
      reader.readAsText(file);
    }
    
    input.value = '';
  }

  connectTeams(): void {
    this.showTeamsSetup = true;
  }

  saveTeamsToken(): void {
    if (this.teamsAccessToken.trim()) {
      this.teamsService.setAccessToken(this.teamsAccessToken.trim());
      this.showTeamsSetup = false;
      this.teamsAccessToken = '';
      this.refreshTeamsPresence();
    }
  }

  disconnectTeams(): void {
    if (confirm('Disconnect from Microsoft Teams?')) {
      this.teamsService.clearAccessToken();
      this.teamsConnected = false;
    }
  }

  getPresenceColor(availability?: string): string {
    if (!availability) return '#8a8886';
    return this.teamsService.getPresenceColor(availability);
  }

  refreshTeamsPresence(): void {
    const coworkersWithEmail = this.coworkers.filter(c => c.email);
    
    if (coworkersWithEmail.length === 0) {
      console.log('No coworkers with email addresses found');
      return;
    }

    console.log(`Fetching presence for ${coworkersWithEmail.length} coworkers`);

    coworkersWithEmail.forEach(coworker => {
      if (coworker.email) {
        console.log(`Fetching presence for: ${coworker.email}`);
        this.teamsService.getUserPresenceByEmail(coworker.email)
          .subscribe({
            next: (presence) => {
              console.log(`Presence for ${coworker.email}:`, presence);
              this.coworkerService.updateCoworker(coworker.id, {
                teamsPresence: {
                  availability: presence.availability,
                  activity: presence.activity
                }
              });
            },
            error: (error) => {
              console.error(`Failed to get presence for ${coworker.email}:`, error);
              console.error('Error details:', {
                status: error.status,
                message: error.error?.error?.message,
                code: error.error?.error?.code
              });
              if (error.status === 401) {
                console.warn('Token may have expired. Please reconnect to Teams.');
              } else if (error.status === 403) {
                console.warn('Permission denied. Token may not have Presence.Read.All permission.');
              } else if (error.status === 404) {
                console.warn(`User ${coworker.email} not found in the organization.`);
              }
            }
          });
      }
    });
  }

  testMyPresence(): void {
    console.log('Testing my presence...');
    
    // Temporarily set the token for testing without saving it
    const tempToken = this.teamsAccessToken.trim();
    if (!tempToken) {
      alert('Please paste an access token first');
      return;
    }
    
    // Temporarily set the token
    const originalToken = this.teamsService['accessTokenSubject'].value;
    this.teamsService['accessTokenSubject'].next(tempToken);
    
    this.teamsService.getMyPresence()
      .subscribe({
        next: (presence) => {
          console.log('My presence response:', presence);
          console.log('Availability:', presence.availability);
          console.log('Activity:', presence.activity);
          alert(`✅ Token is valid!\n\nYour presence:\nAvailability: ${presence.availability}\nActivity: ${presence.activity}\n\nYou can now click "Connect" to save it.`);
          
          // Restore original token (if any)
          this.teamsService['accessTokenSubject'].next(originalToken);
        },
        error: (error) => {
          console.error('Full error object:', error);
          console.error('Error status:', error.status);
          console.error('Error message:', error.message);
          console.error('Error response:', error.error);
          
          let errorMsg = `❌ Token test failed!\n\nError ${error.status}: `;
          if (error.error?.error?.message) {
            errorMsg += error.error.error.message;
          } else if (error.message) {
            errorMsg += error.message;
          } else {
            errorMsg += 'Unknown error';
          }
          
          alert(errorMsg);
          
          // Restore original token (if any)
          this.teamsService['accessTokenSubject'].next(originalToken);
        }
      });
  }

  fetchUserDataFromTeams(email: string): void {
    if (!this.teamsConnected || !email) {
      return;
    }

    console.log(`Fetching Teams profile for: ${email}`);
    
    // Fetch user profile
    this.teamsService.getUserProfile(email)
      .subscribe({
        next: (profile) => {
          console.log('User profile:', profile);
          
          // Find the coworker and update with profile data
          const coworker = this.coworkers.find(c => c.email === email);
          if (coworker) {
            const updates: Partial<Coworker> = {};
            
            // Update name if needed
            if (profile.displayName) {
              updates.name = profile.displayName;
            }
            
            // Update job title
            if (profile.jobTitle) {
              updates.role = profile.jobTitle;
            }
            
            // Fetch timezone first, then use it for location
            this.teamsService.getUserMailboxSettings(email)
              .subscribe({
                next: (mailboxSettings) => {
                  if (mailboxSettings.timeZone) {
                    const ianaTimezone = this.teamsService.mapWindowsTimezoneToIANA(mailboxSettings.timeZone);
                    updates.timezone = ianaTimezone;
                    
                    // Use timezone as location instead of officeLocation
                    updates.location = this.getLocationFromTimezone(ianaTimezone);
                    
                    console.log(`Auto-detected timezone: ${ianaTimezone}`);
                  }
                  
                  this.coworkerService.updateCoworker(coworker.id, updates);
                },
                error: () => {
                  // Fallback to office location if timezone fetch fails
                  if (profile.officeLocation) {
                    updates.location = profile.officeLocation;
                  }
                  this.coworkerService.updateCoworker(coworker.id, updates);
                }
              });
            
            // Fetch profile photo
            this.fetchUserPhoto(email, coworker.id);
          }
        },
        error: (error) => {
          console.error('Failed to fetch user profile:', error);
        }
      });
  }

  fetchUserPhoto(email: string, coworkerId: number): void {
    this.teamsService.getUserPhoto(email)
      .subscribe({
        next: (photoBlob) => {
          const photoUrl = URL.createObjectURL(photoBlob);
          this.coworkerService.updateCoworker(coworkerId, { photoUrl });
        },
        error: (error) => {
          console.log('No profile photo available for', email);
        }
      });
  }

  lookupUserByEmail(): void {
    if (!this.teamsConnected) {
      alert('Please connect to Microsoft Teams first');
      return;
    }
    
    const email = this.newCoworker.email.trim();
    if (!email) {
      return;
    }
    
    console.log('Looking up user:', email);
    
    // Fetch user profile
    this.teamsService.getUserProfile(email)
      .subscribe({
        next: (profile) => {
          console.log('Found user:', profile);
          
          // Auto-populate fields
          if (profile.displayName && !this.newCoworker.name) {
            this.newCoworker.name = profile.displayName;
          }
          
          if (profile.jobTitle) {
            this.newCoworker.role = profile.jobTitle;
          }
          
          if (profile.officeLocation) {
            this.newCoworker.location = profile.officeLocation;
          }
          
          // Now fetch timezone from mailbox settings
          this.teamsService.getUserMailboxSettings(email)
            .subscribe({
              next: (mailboxSettings) => {
                console.log('Mailbox settings:', mailboxSettings);
                
                if (mailboxSettings.timeZone) {
                  // Convert Windows timezone to IANA format
                  const ianaTimezone = this.teamsService.mapWindowsTimezoneToIANA(mailboxSettings.timeZone);
                  const matchingOffset = this.timezoneOffsets.find(tz => tz.timezone === ianaTimezone);
                  if (matchingOffset) {
                    this.newCoworker.timezoneOffset = matchingOffset.value;
                    this.newCoworker.location = matchingOffset.city;
                  }
                  console.log(`Mapped ${mailboxSettings.timeZone} to ${ianaTimezone}`);
                }
                
                alert(`✅ Found user: ${profile.displayName}\n${profile.jobTitle || 'No job title'}\n${profile.officeLocation || 'No location'}\nTimezone: ${mailboxSettings.timeZone || 'Not set'}`);
              },
              error: (error) => {
                console.warn('Could not fetch timezone:', error);
                // Still show success even if timezone fetch fails
                alert(`✅ Found user: ${profile.displayName}\n${profile.jobTitle || 'No job title'}\n${profile.officeLocation || 'No location'}\n\n⚠️ Could not fetch timezone (may need MailboxSettings.Read permission)`);
              }
            });
        },
        error: (error) => {
          console.error('User lookup failed:', error);
          if (error.status === 404) {
            alert('❌ User not found. Please check the email address.');
          } else {
            alert(`❌ Error: ${error.error?.error?.message || error.message}`);
          }
        }
      });
  }

  getAvatarInitial(name: string): string {
    if (!name) return '??';
    
    // Check if name has comma (e.g., "Geier, Nathan" or "Last, First Middle")
    if (name.includes(',')) {
      const parts = name.split(',').map(part => part.trim());
      const lastName = parts[0];
      const firstName = parts[1];
      
      if (firstName && lastName) {
        // Get first char of first name and first char of last name
        return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
      }
    }
    
    // Default: handle "First Last" or "First Middle Last" format
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      // First char of first word + first char of last word
      return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
    }
    
    // Single word: return first two characters
    return name.substring(0, 2).toUpperCase();
  }

  formatCoworkerName(name: string): string {
    if (!name) return '';
    
    let formattedName = name;
    
    // Remove text in parentheses
    formattedName = formattedName.replace(/\s*\([^)]*\)/g, '').trim();
    
    // If name has comma, switch to "First Last" format
    if (formattedName.includes(',')) {
      const parts = formattedName.split(',').map(part => part.trim());
      const lastName = parts[0];
      const firstName = parts[1] || '';
      formattedName = `${firstName} ${lastName}`.trim();
    }
    
    return formattedName;
  }

  openTeamsChat(email: string): void {
    if (!email) {
      alert('No email address available for this coworker');
      return;
    }
    
    // Teams deep link format: https://teams.microsoft.com/l/chat/0/0?users=email@domain.com
    const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}`;
    window.open(teamsUrl, '_blank');
  }

  private getLocationFromTimezone(ianaTimezone: string): string {
    const timezoneMatch = this.timezoneOffsets.find(tz => tz.timezone === ianaTimezone);
    return timezoneMatch?.city || 'Unknown';
  }
}
