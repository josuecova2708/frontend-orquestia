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
import { InstanciaProceso, Proceso, TareaInstancia, Departamento, UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'orq-mi-historial-page',
  standalone: true,
  imports: [
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    FormsModule, DatePipe,
    TopNavbarComponent
  ],
  templateUrl: './mi-historial-page.html',
  styleUrl: './mi-historial-page.scss'
})
export class MiHistorialPage implements OnInit, OnDestroy {
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

    return list;
  });

  // Historial inline
  instanciaAbierta  = signal<string | null>(null);
  historialTareas   = signal<TareaInstancia[]>([]);
  cargandoHistorial = signal(false);

  private wsSub: Subscription | null = null;

  constructor(
    public auth: AuthService,
    private motorService: MotorService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private wsService: WebSocketService,
    public router: Router
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    if (!user?.empresaId) { this.router.navigate(['/setup-empresa']); return; }

    this.procesoService.listar(user.empresaId).subscribe({ next: (p) => this.procesos.set(p) });
    this.apiService.getDepartamentos(user.empresaId).subscribe({ next: (d) => this.departamentos.set(d) });
    this.apiService.getFuncionarios(user.empresaId).subscribe({ next: (f) => this.funcionarios.set(f) });
    this.cargarInstancias();

    // Cuando llega una tarea nueva, refrescar la lista de instancias
    const token = this.auth.token();
    if (token) {
      this.wsSub = this.wsService.conectarUsuario(user.userId, token).subscribe(event => {
        if (event.tipo === 'TAREA_ASIGNADA') this.cargarInstancias();
      });
    }
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }

  cargarInstancias() {
    this.motorService.obtenerMisInstancias().subscribe({
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
    this.historialTareas.set([]);
    this.cargandoHistorial.set(true);
    this.motorService.obtenerTareasDeInstancia(inst.id).subscribe({
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

  esMiTarea(tarea: TareaInstancia): boolean {
    return tarea.asignadoA === this.auth.user()?.userId;
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
