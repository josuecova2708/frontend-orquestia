import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';
import { ProcesoService } from '../../../shared/services/proceso';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { Proceso, Empresa, Departamento, InstanciaProceso } from '../../../shared/models/interfaces';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'orq-dashboard',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatIconModule, MatCardModule,
    MatMenuModule, MatDialogModule, MatFormFieldModule, MatInputModule, FormsModule, DatePipe
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  procesos = signal<Proceso[]>([]);
  empresa = signal<Empresa | null>(null);
  departamentos = signal<Departamento[]>([]);
  instanciasActivas = signal<InstanciaProceso[]>([]);
  showInstancias = signal(false);

  // Formulario "Nuevo proceso"
  showCreateProceso = signal(false);
  newNombre = '';
  newDescripcion = '';

  // Formulario "Nuevo departamento"
  showCreateDepto = signal(false);
  newDeptoNombre = '';
  newDeptoDesc = '';
  savingDepto = signal(false);

  constructor(
    public auth: AuthService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private motorService: MotorService,
    private router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) {
      this.router.navigate(['/setup-empresa']);
      return;
    }
    this.cargarEmpresa(empresaId);
    this.cargarProcesos(empresaId);
    this.cargarDepartamentos(empresaId);
  }

  cargarEmpresa(id: string) {
    this.apiService.getEmpresa(id).subscribe({
      next: (e) => this.empresa.set(e)
    });
  }

  cargarProcesos(empresaId: string) {
    this.procesoService.listar(empresaId).subscribe({
      next: (p) => this.procesos.set(p)
    });
  }

  cargarDepartamentos(empresaId: string) {
    this.apiService.getDepartamentos(empresaId).subscribe({
      next: (d) => this.departamentos.set(d)
    });
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
        this.newNombre = '';
        this.newDescripcion = '';
        this.router.navigate(['/diagramador', proceso.id]);
      }
    });
  }

  abrirDiagramador(proceso: Proceso) {
    this.router.navigate(['/diagramador', proceso.id]);
  }

  irMisTareas() {
    this.router.navigate(['/mis-tareas']);
  }

  iniciarProceso(proceso: Proceso, event: Event) {
    event.stopPropagation();
    this.motorService.iniciarProceso(proceso.id).subscribe({
      next: () => {
        this.router.navigate(['/mis-tareas']);
      }
    });
  }

  eliminarProceso(proceso: Proceso, event: Event) {
    event.stopPropagation();
    if (confirm('¿Seguro que deseas eliminar este proceso definitivamente?')) {
      this.procesoService.eliminar(proceso.id).subscribe({
        next: () => {
          this.procesos.update(list => list.filter(p => p.id !== proceso.id));
        }
      });
    }
  }

  verInstancias() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.motorService.listarInstanciasActivas(empresaId).subscribe({
      next: (instancias) => {
        this.instanciasActivas.set(instancias);
        this.showInstancias.set(true);
      }
    });
  }

  cancelarInstancia(instanciaId: string) {
    this.motorService.cancelarInstancia(instanciaId).subscribe({
      next: () => {
        this.instanciasActivas.update(list => list.filter(i => i.id !== instanciaId));
      }
    });
  }

  getNombreProceso(procesoId: string): string {
    return this.procesos().find(p => p.id === procesoId)?.nombre ?? procesoId.slice(-6);
  }

  // === Departamentos ===

  crearDepartamento() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId || !this.newDeptoNombre.trim()) return;
    this.savingDepto.set(true);
    this.apiService.crearDepartamento(empresaId, {
      nombre: this.newDeptoNombre.trim(),
      descripcion: this.newDeptoDesc
    }).subscribe({
      next: (d) => {
        this.departamentos.update(list => [...list, d]);
        this.showCreateDepto.set(false);
        this.newDeptoNombre = '';
        this.newDeptoDesc = '';
        this.savingDepto.set(false);
      },
      error: () => this.savingDepto.set(false)
    });
  }

  eliminarDepartamento(id: string, event: Event) {
    event.stopPropagation(); // No hacer bubbling al card
    this.apiService.eliminarDepartamento(id).subscribe({
      next: () => this.departamentos.update(list => list.filter(d => d.id !== id))
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
