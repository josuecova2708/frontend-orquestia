import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmModalService } from '../../services/confirm-modal.service';

@Component({
  selector: 'orq-confirm-modal',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss'
})
export class ConfirmModalComponent {
  constructor(public modal: ConfirmModalService) {}
}
