import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';
import { ProcesoService } from '../../../shared/services/proceso';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { Proceso, Empresa, Departamento, UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'orq-dashboard',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, FormsModule,
    TopNavbarComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  procesos      = signal<Proceso[]>([]);
  empresa       = signal<Empresa | null>(null);
  departamentos = signal<Departamento[]>([]);
  funcionarios  = signal<UsuarioResponse[]>([]);

  creandoVersionId = signal<string | null>(null);

  // Asignaciones por proceso
  asignandoProcesoId = signal<string | null>(null);
  asignacionesTemp: Record<string, string> = {};
  guardandoAsignacion = signal(false);

  // Formulario "Nuevo proceso"
  showCreateProceso = signal(false);
  newNombre    = '';
  newDescripcion = '';

  constructor(
    public auth: AuthService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private motorService: MotorService,
    public router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.router.navigate(['/setup-empresa']); return; }
    this.apiService.getEmpresa(empresaId).subscribe({ next: (e) => this.empresa.set(e) });
    this.procesoService.listar(empresaId).subscribe({ next: (p) => this.procesos.set(p) });
    this.apiService.getDepartamentos(empresaId).subscribe({ next: (d) => this.departamentos.set(d) });
    this.apiService.getFuncionarios(empresaId).subscribe({
      next: (f) => this.funcionarios.set(f.filter(u => u.rol === 'FUNCIONARIO' && u.activo))
    });
  }

  // === Asignaciones ===

  abrirAsignacion(proceso: Proceso, event: Event) {
    event.stopPropagation();
    if (this.asignandoProcesoId() === proceso.id) {
      this.asignandoProcesoId.set(null);
      return;
    }
    this.asignacionesTemp = { ...(proceso.asignaciones ?? {}) };
    this.asignandoProcesoId.set(proceso.id);
  }

  getDeptosDelProceso(proceso: Proceso): Departamento[] {
    const deptoIds = new Set(
      proceso.nodos
        .filter(n => n.tipo === 'ACTIVIDAD' && n.departamentoId)
        .map(n => n.departamentoId!)
    );
    return this.departamentos().filter(d => deptoIds.has(d.id));
  }

  getFuncionariosDeDept(deptoId: string): UsuarioResponse[] {
    return this.funcionarios().filter(f => f.departamentoId === deptoId);
  }

  guardarAsignacion(proceso: Proceso) {
    this.guardandoAsignacion.set(true);
    this.procesoService.guardarAsignaciones(proceso.id, this.asignacionesTemp).subscribe({
      next: (p) => {
        this.procesos.update(list => list.map(pr => pr.id === p.id ? p : pr));
        this.asignandoProcesoId.set(null);
        this.guardandoAsignacion.set(false);
      },
      error: () => this.guardandoAsignacion.set(false)
    });
  }

  getAsignacionEntries(proceso: Proceso): { deptNombre: string; userName: string }[] {
    return Object.entries(proceso.asignaciones ?? {})
      .filter(([, userId]) => !!userId)
      .map(([deptId, userId]) => ({
        deptNombre: this.departamentos().find(d => d.id === deptId)?.nombre ?? deptId,
        userName:   (() => { const f = this.funcionarios().find(f => f.id === userId); return f ? f.nombre : ''; })()
      }));
  }

  // === Procesos ===

  crearProceso() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId || !this.newNombre.trim()) return;
    this.procesoService.crear({
      nombre: this.newNombre.trim(),
      descripcion: this.newDescripcion,
      empresaId
    }).subscribe({
      next: (proceso) => {
        this.showCreateProceso.set(false);
        this.newNombre     = '';
        this.newDescripcion = '';
        this.router.navigate(['/diagramador', proceso.id]);
      }
    });
  }

  abrirDiagramador(proceso: Proceso) {
    this.router.navigate(['/diagramador', proceso.id]);
  }

  crearNuevaVersion(proceso: Proceso, event: Event) {
    event.stopPropagation();
    if (!confirm(
      `¿Crear nueva versión de "${proceso.nombre}"?\n\n` +
      `El proceso actual será archivado y no se podrán iniciar nuevas ejecuciones con él. ` +
      `Las instancias activas continuarán normalmente.`
    )) return;
    this.creandoVersionId.set(proceso.id);
    this.procesoService.crearNuevaVersion(proceso.id).subscribe({
      next: (nuevo) => {
        this.creandoVersionId.set(null);
        this.router.navigate(['/diagramador', nuevo.id]);
      },
      error: () => {
        this.creandoVersionId.set(null);
        alert('Error al crear nueva versión.');
      }
    });
  }

  eliminarProceso(proceso: Proceso, event: Event) {
    event.stopPropagation();
    if (confirm('¿Seguro que deseas eliminar este proceso definitivamente?')) {
      this.procesoService.eliminar(proceso.id).subscribe({
        next: () => this.procesos.update(list => list.filter(p => p.id !== proceso.id)),
        error: (err) => {
          if (err.status === 409) {
            alert('No se puede eliminar: el proceso tiene instancias activas en curso.');
          } else {
            alert('Error al eliminar el proceso.');
          }
        }
      });
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
