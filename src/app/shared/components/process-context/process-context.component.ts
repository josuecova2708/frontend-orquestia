import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-process-context',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './process-context.html',
  styleUrl: './process-context.scss'
})
export class ProcessContextComponent {
  @Input() contextoPrevio: any[] = [];
  @Input() campoLabels: Record<string, string> = {};

  tipoContexto(valor: any): string {
    if (typeof valor === 'boolean') return 'bool';
    if (typeof valor === 'string' && valor.startsWith('http')) return 'archivo';
    return 'texto';
  }
}
