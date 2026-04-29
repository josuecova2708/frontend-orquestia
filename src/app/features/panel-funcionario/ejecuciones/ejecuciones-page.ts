import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../shared/services/auth';
import { MotorService } from '../../../shared/services/motor';
import { ProcesoService } from '../../../shared/services/proceso';
import { ApiService } from '../../../shared/services/api';
import { WebSocketService } from '../../../shared/services/websocket.service';
import {
  InstanciaProceso, Proceso, TareaInstancia,
  Departamento, UsuarioResponse
} from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';
import { ConfirmModalService } from '../../../shared/services/confirm-modal.service';

@Component({
  selector: 'orq-ejecuciones-page',
  standalone: true,
  imports: [
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    FormsModule, DatePipe,
    TopNavbarComponent
  ],
  templateUrl: './ejecuciones-page.html',
  styleUrl: './ejecuciones-page.scss'
})
export class EjecucionesPage implements OnInit, OnDestroy {
  procesos        = signal<Proceso[]>([]);
  departamentos   = signal<Departamento[]>([]);
  funcionarios    = signal<UsuarioResponse[]>([]);
  todasInstancias = signal<InstanciaProceso[]>([]);

  filtroEstado     = signal<string>('');
  filtroProceso    = signal<string>('');
  filtroFechaDesde = signal<string>('');
  filtroFechaHasta = signal<string>('');

  instanciasFiltradas = computed(() => {
    let list = [...this.todasInstancias()];
    const estado = this.filtroEstado();
    const proc   = this.filtroProceso();
    const desde  = this.filtroFechaDesde();
    const hasta  = this.filtroFechaHasta();

    if (estado) list = list.filter(i => i.estado === estado);
    if (proc)   list = list.filter(i => i.procesoId === proc);
    if (desde)  list = list.filter(i => new Date(i.fechaInicio) >= new Date(desde));
    if (hasta)  list = list.filter(i => new Date(i.fechaInicio) <= new Date(hasta + 'T23:59:59'));

    return list.sort((a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime());
  });

  // Historial inline
  instanciaAbierta  = signal<string | null>(null);
  historialTareas   = signal<TareaInstancia[]>([]);
  cargandoHistorial = signal(false);

  copiado = signal<string | null>(null);

  copiarInstanciaId(id: string, event: Event) {
    event.stopPropagation();
    navigator.clipboard.writeText(id).then(() => {
      this.copiado.set(id);
      setTimeout(() => this.copiado.set(null), 2000);
    });
  }

  private wsEmpresaSub: Subscription | null = null;

  constructor(
    public auth: AuthService,
    private motorService: MotorService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private wsService: WebSocketService,
    public router: Router,
    private modal: ConfirmModalService
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.router.navigate(['/setup-empresa']); return; }

    this.procesoService.listar(empresaId).subscribe({ next: (p) => this.procesos.set(p) });
    this.apiService.getDepartamentos(empresaId).subscribe({ next: (d) => this.departamentos.set(d) });
    this.apiService.getFuncionarios(empresaId).subscribe({ next: (f) => this.funcionarios.set(f) });
    this.cargarInstancias(empresaId);

    const token = this.auth.token();
    if (token) {
      this.wsEmpresaSub = this.wsService.conectarEmpresa(empresaId, token).subscribe(() => {
        this.cargarInstancias(empresaId);
        // Refresca el historial abierto si la instancia cambió
        const abierta = this.instanciaAbierta();
        if (abierta) this.cargarHistorial(abierta);
      });
    }
  }

  ngOnDestroy() {
    this.wsEmpresaSub?.unsubscribe();
    this.wsService.desconectarEmpresa();
  }

  cargarInstancias(empresaId: string) {
    this.motorService.listarInstancias(empresaId).subscribe({
      next: (inst) => this.todasInstancias.set(inst)
    });
  }

  // === Historial ===

  toggleHistorial(inst: InstanciaProceso) {
    if (this.instanciaAbierta() === inst.id) {
      this.instanciaAbierta.set(null);
      return;
    }
    this.instanciaAbierta.set(inst.id);
    this.cargarHistorial(inst.id);
  }

  private cargarHistorial(instanciaId: string) {
    this.cargandoHistorial.set(true);
    this.motorService.obtenerTareasDeInstancia(instanciaId).subscribe({
      next: (tareas) => {
        this.historialTareas.set(
          [...tareas].sort((a, b) =>
            new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime()
          )
        );
        this.cargandoHistorial.set(false);
      },
      error: () => this.cargandoHistorial.set(false)
    });
  }

  // === Acciones ===

  async cancelarInstancia(instanciaId: string, event: Event) {
    event.stopPropagation();
    const ok = await this.modal.confirm(
      'La instancia pasará a estado CANCELADA y todas sus tareas abiertas serán rechazadas.',
      '¿Cancelar esta ejecución?'
    );
    if (!ok) return;
    this.motorService.cancelarInstancia(instanciaId).subscribe({
      next: () => {
        this.todasInstancias.update(list =>
          list.map(i => i.id === instanciaId ? { ...i, estado: 'CANCELADA' as const } : i)
        );
      }
    });
  }

  limpiarFiltros() {
    this.filtroEstado.set('');
    this.filtroProceso.set('');
    this.filtroFechaDesde.set('');
    this.filtroFechaHasta.set('');
  }

  // === Helpers ===

  getNombreProceso(procesoId: string): string {
    return this.procesos().find(p => p.id === procesoId)?.nombre ?? procesoId.slice(-6);
  }

  getDeptNombre(deptId: string): string {
    return this.departamentos().find(d => d.id === deptId)?.nombre ?? deptId;
  }

  getNombreUsuario(userId: string): string {
    const f = this.funcionarios().find(f => f.id === userId);
    return f ? `${f.nombre} ${f.apellido}` : userId;
  }

  objectEntries(obj: Record<string, unknown>): [string, unknown][] {
    return Object.entries(obj ?? {});
  }

  formatDatoVal(val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://')))
      return '(archivo adjunto)';
    return String(val);
  }

  get hayFiltrosActivos(): boolean {
    return !!(this.filtroEstado() || this.filtroProceso() || this.filtroFechaDesde() || this.filtroFechaHasta());
  }
}
