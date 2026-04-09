import { Component, Input, Output, EventEmitter } from '@angular/core';
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
export class NodoComponent {
  @Input({ required: true }) nodo!: Nodo;
  @Input() isSelected = false;
  @Input() isDraft = false;

  @Output() actionMouseDown = new EventEmitter<MouseEvent | TouchEvent>();
  @Output() actionMouseUp = new EventEmitter<void>();
  @Output() actionPortMouseDown = new EventEmitter<MouseEvent | TouchEvent>();

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
}
