import { Component, Input, Output, EventEmitter, OnDestroy, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Nodo } from '../../../../shared/models/interfaces';

@Component({
  selector: 'orq-nodo',
  standalone: true,
  imports: [NgClass, MatIconModule],
  templateUrl: './nodo.component.html',
  styleUrl: './nodo.component.scss'
})
export class NodoComponent implements OnDestroy {
  @Input({ required: true }) nodo!: Nodo;
  @Input() isSelected = false;
  @Input() isDraft = false;

  @Output() actionMouseDown = new EventEmitter<MouseEvent | TouchEvent>();
  @Output() actionMouseUp = new EventEmitter<void>();
  @Output() actionPortMouseDown = new EventEmitter<MouseEvent | TouchEvent>();

  readonly showTooltip = signal(false);
  private _tooltipTimer: ReturnType<typeof setTimeout> | null = null;

  onClick(event: MouseEvent) {
    event.stopPropagation();
  }

  onMouseDown(event: MouseEvent | TouchEvent) {
    event.stopPropagation();
    this.actionMouseDown.emit(event);
  }

  onMouseUp() {
    this.actionMouseUp.emit();
  }

  onPortMouseDown(event: MouseEvent | TouchEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.actionPortMouseDown.emit(event);
  }

  onMouseEnter() {
    this._tooltipTimer = setTimeout(() => this.showTooltip.set(true), 2000);
  }

  onMouseLeave() {
    if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }
    this.showTooltip.set(false);
  }

  ngOnDestroy() {
    if (this._tooltipTimer) clearTimeout(this._tooltipTimer);
  }
}
