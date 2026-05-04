import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MsGraphConnectService } from '../../services/ms-graph-connect.service';

@Component({
  selector: 'app-ms-graph-connect-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ms-graph-connect-modal.component.html',
  styleUrl: './ms-graph-connect-modal.component.scss'
})
export class MsGraphConnectModalComponent {
  token = '';

  constructor(public connectService: MsGraphConnectService) {}

  connect(): void {
    if (!this.token.trim()) return;
    this.connectService.applyToken(this.token.trim());
    this.token = '';
  }

  close(): void {
    this.connectService.closeModal();
    this.token = '';
  }

  openGraphExplorer(): void {
    window.open(
      'https://developer.microsoft.com/en-us/graph/graph-explorer',
      '_blank',
      'noopener,noreferrer'
    );
  }
}
