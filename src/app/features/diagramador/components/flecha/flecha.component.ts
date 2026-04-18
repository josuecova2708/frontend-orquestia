import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { Conexion, Nodo } from '../../../../shared/models/interfaces';
import { NgClass } from '@angular/common';

@Component({
  selector: 'g[orq-flecha]',
  standalone: true,
  templateUrl: './flecha.component.html',
  styleUrl: './flecha.component.scss'
})
export class FlechaComponent implements OnChanges {
  @Input({ required: true }) conexion!: Conexion;
  @Input({ required: true }) sourceNode!: Nodo;
  @Input({ required: true }) targetNode!: Nodo;
  @Input() isSelected = false;

  @Output() actionMouseDown = new EventEmitter<MouseEvent | TouchEvent>();

  pathD = '';
  labelX = 0;
  labelY = 0;

  ngOnChanges() {
    if (this.sourceNode && this.targetNode) {
      this.calculateSmartOrthogonalPath();
    }
  }

  onClick(event: MouseEvent) {
    event.stopPropagation();
  }

  onMouseDown(event: MouseEvent | TouchEvent) {
    event.stopPropagation();
    this.actionMouseDown.emit(event);
  }

  private getBounds(node: Nodo) {
    let w = 176, h = 60; // default ACTIVIDAD
    if (node.tipo === 'INICIO' || node.tipo === 'FIN') { w = 60; h = 60; }
    else if (node.tipo === 'GATEWAY_XOR') { w = 100; h = 100; }
    else if (node.tipo === 'GATEWAY_AND') { w = 180; h = 24; }
    
    return {
      cx: node.posX + w/2,
      cy: node.posY + h/2,
      top: { x: node.posX + w/2, y: node.posY },
      bottom: { x: node.posX + w/2, y: node.posY + h },
      left: { x: node.posX, y: node.posY + h/2 },
      right: { x: node.posX + w, y: node.posY + h/2 }
    };
  }

  private calculateSmartOrthogonalPath() {
    const s = this.getBounds(this.sourceNode);
    const t = this.getBounds(this.targetNode);

    // Dynamic Multi-Port Adjustment for GATEWAY_AND
    if (this.sourceNode.tipo === 'GATEWAY_AND') {
       const isTargetLeft = t.cx < s.cx;
       const sW = 180; // width from getBounds
       const pLeft = this.sourceNode.posX + sW * 0.2;
       const pRight = this.sourceNode.posX + sW * 0.8;
       s.bottom.x = isTargetLeft ? pLeft : pRight;
       s.top.x = isTargetLeft ? pLeft : pRight;
    }
    
    if (this.targetNode.tipo === 'GATEWAY_AND') {
       const isSourceLeft = s.cx < t.cx;
       const tW = 180;
       const pLeft = this.targetNode.posX + tW * 0.2;
       const pRight = this.targetNode.posX + tW * 0.8;
       t.bottom.x = isSourceLeft ? pLeft : pRight;
       t.top.x = isSourceLeft ? pLeft : pRight;
    }

    // Consider target below if it's generally downwards
    const isBelow = t.cy > s.cy + 30; 
    const isAbove = t.cy < s.cy - 30;

    let sX, sY, eX, eY;
    const r = 5;

    // RULE 1: If strictly below, ALWAYS use Bottom -> Top
    if (isBelow) {
       sX = s.bottom.x; sY = s.bottom.y; eX = t.top.x; eY = t.top.y;
       
       if (Math.abs(sX - eX) <= r * 2) {
           // Straight line down (or slightly angled if minor misalignment)
           this.pathD = `M ${sX} ${sY} L ${eX} ${eY}`;
           this.labelX = sX + 10;
           this.labelY = sY + (eY - sY) / 2;
       } else {
           // 3-segment line with elbows
           const midY = sY + (eY - sY) / 2;
           this.pathD = `M ${sX} ${sY} 
                         L ${sX} ${midY - r} 
                         Q ${sX} ${midY} ${sX < eX ? sX + r : sX - r} ${midY}
                         L ${eX > sX ? eX - r : eX + r} ${midY}
                         Q ${eX} ${midY} ${eX} ${midY + r}
                         L ${eX} ${eY}`;
           this.labelX = sX + (eX - sX) / 2;
           this.labelY = midY - 8;
       }
    } 
    // RULE 2: If roughly side-by-side, use Left/Right
    else if (!isBelow && !isAbove) {
       if (t.cx > s.cx) {
           sX = s.right.x; sY = s.right.y; eX = t.left.x; eY = t.left.y;
       } else {
           sX = s.left.x; sY = s.left.y; eX = t.right.x; eY = t.right.y;
       }

       if (Math.abs(sY - eY) <= r * 2) {
           // Straight line horizontal
           this.pathD = `M ${sX} ${sY} L ${eX} ${eY}`;
           this.labelX = sX + (eX - sX) / 2;
           this.labelY = sY - 10;
       } else {
           // 3-segment horizontal line with elbows
           const midX = sX + (eX - sX) / 2;
           this.pathD = `M ${sX} ${sY} 
                         L ${midX + (sX > eX ? -r : r)} ${sY} 
                         Q ${midX} ${sY} ${midX} ${sY < eY ? sY + r : sY - r}
                         L ${midX} ${eY > sY ? eY - r : eY + r}
                         Q ${midX} ${eY} ${eX > midX ? midX + r : midX - r} ${eY}
                         L ${eX} ${eY}`;
           this.labelX = midX;
           this.labelY = sY + (eY - sY) / 2 - 8;
       }
    }
    // RULE 3: Backwards flow (Loop) - Target is strictly above source
    else {
       // Loop upwards! Route out Right, go right, go up, enter Right.
       sX = s.right.x; sY = s.right.y; eX = t.right.x; eY = t.right.y;
       
       const escapeX = Math.max(s.right.x, t.right.x) + 40;
       
       this.pathD = `M ${sX} ${sY} 
                     L ${escapeX - r} ${sY}
                     Q ${escapeX} ${sY} ${escapeX} ${sY - r}
                     L ${escapeX} ${eY + r}
                     Q ${escapeX} ${eY} ${escapeX - r} ${eY}
                     L ${eX} ${eY}`;
       this.labelX = escapeX + 8;
       this.labelY = eY + (sY - eY) / 2;
    }
  }

  get strokeColor(): string {
    if (this.conexion.tipo === 'CONDICIONAL') return '#f59e0b'; // Naranja
    if (this.conexion.tipo === 'RETORNO')     return '#ef4444'; // Rojo
    return '#64748b'; // Gris para NORMAL
  }

  get arrowMarkerId(): string {
    if (this.conexion.tipo === 'CONDICIONAL') return 'arrowhead-condicional';
    if (this.conexion.tipo === 'RETORNO')     return 'arrowhead-retorno';
    return 'arrowhead';
  }

  get labelColor(): string {
    const lbl = this.conexion.label?.toLowerCase() || '';
    if (this.conexion.tipo === 'RETORNO')     return '#ef4444';
    if (this.conexion.tipo === 'CONDICIONAL') return '#f59e0b';
    if (lbl === 'no')  return '#ef4444';
    if (lbl === 'si' || lbl === 'yes') return '#22c55e';
    return '#64748b';
  }
}
