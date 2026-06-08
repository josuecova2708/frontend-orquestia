import { Component, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../shared/services/auth';
import { MotorService } from '../../../shared/services/motor';
import { PrediccionService, PrediccionResponse } from '../../../shared/services/prediccion';
import { InstanciaProceso } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'orq-prediccion-page',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, TopNavbarComponent
  ],
  templateUrl: './prediccion-page.html',
  styleUrl: './prediccion-page.scss'
})
export class PrediccionPage implements OnInit {

  activas       = signal<InstanciaProceso[]>([]);
  cargandoLista = signal(true);
  seleccionada  = signal<InstanciaProceso | null>(null);
  resultado     = signal<PrediccionResponse | null>(null);
  cargandoPred  = signal(false);
  errorPred     = signal('');
  sembrando     = signal(false);
  mensajeSeed   = signal('');

  constructor(
    public auth: AuthService,
    private motor: MotorService,
    private prediccion: PrediccionService,
    public router: Router
  ) {}

  ngOnInit() {
    this.cargarActivas();
  }

  cargarActivas() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.cargandoLista.set(true);
    this.motor.listarInstancias(empresaId, 'ACTIVA').subscribe({
      next: (list) => {
        this.activas.set(list.sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)));
        this.cargandoLista.set(false);
      },
      error: () => this.cargandoLista.set(false)
    });
  }

  seleccionar(inst: InstanciaProceso) {
    if (this.cargandoPred()) return;
    this.seleccionada.set(inst);
    this.resultado.set(null);
    this.errorPred.set('');
    this.cargandoPred.set(true);
    this.prediccion.predecir(inst.id).subscribe({
      next: (r) => { this.resultado.set(r); this.cargandoPred.set(false); },
      error: (e) => {
        this.cargandoPred.set(false);
        this.errorPred.set(e?.error?.message || 'No se pudo obtener la predicción. ¿Está corriendo el microservicio de IA?');
      }
    });
  }

  regenerarDemo() {
    if (this.sembrando()) return;
    const ok = confirm('Esto recreará la empresa "Demo Deep Learning" con datos frescos (no afecta tus otras empresas). ¿Continuar?');
    if (!ok) return;
    this.sembrando.set(true);
    this.mensajeSeed.set('');
    this.prediccion.sembrarDemo().subscribe({
      next: (r) => {
        this.sembrando.set(false);
        this.mensajeSeed.set(
          `Demo lista: ${r.funcionarios} funcionarios, ${r.procesos} procesos, ` +
          `${r.instanciasActivas} instancias activas. Si no la ves, cambia a la empresa "${r.empresaNombre}".`
        );
        this.seleccionada.set(null);
        this.resultado.set(null);
        this.cargarActivas();
      },
      error: () => {
        this.sembrando.set(false);
        this.mensajeSeed.set('No se pudo generar la demo.');
      }
    });
  }

  // ── Helpers de presentación ──────────────────────────────────────────────

  nivel(r: number): string {
    return r >= 0.7 ? 'ALTO' : r >= 0.4 ? 'MEDIO' : 'BAJO';
  }

  color(r: number): string {
    return r >= 0.7 ? '#dc2626' : r >= 0.4 ? '#d97706' : '#16a34a';
  }

  gaugeBg(r: number): string {
    const grados = Math.round(r * 360);
    return `conic-gradient(${this.color(r)} ${grados}deg, #e5e7eb ${grados}deg)`;
  }

  pct(r: number): number {
    return Math.round(r * 100);
  }

  /** Convierte minutos a un texto legible (min / h). */
  legible(min: number): string {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }

  accuracyPct(): string {
    const a = this.resultado()?.modelo_info?.val_accuracy;
    return a != null ? `${(a * 100).toFixed(1)}%` : '—';
  }

  /** Nombre corto del día a partir de 0=lunes ... 6=domingo. */
  dia(d: number): string {
    return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d] ?? String(d);
  }

  esFinde(d: number): boolean {
    return d >= 5;
  }
}
