import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../../shared/services/auth';
import { ProcesoService } from '../../../shared/services/proceso';
import { ApiService } from '../../../shared/services/api';
import { Proceso, Empresa } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-dashboard',
  standalone: true,
  imports: [
    MatToolbarModule, MatButtonModule, MatIconModule, MatCardModule,
    MatChipsModule, MatMenuModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, FormsModule, SlicePipe
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {
  procesos = signal<Proceso[]>([]);
  empresas = signal<Empresa[]>([]);
  empresaActual = signal<Empresa | null>(null);

  // Para crear nuevo proceso
  showCreateForm = signal(false);
  newNombre = '';
  newDescripcion = '';

  constructor(
    public auth: AuthService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private router: Router
  ) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.cargarEmpresas();
  }

  cargarEmpresas() {
    this.apiService.getEmpresas().subscribe({
      next: (empresas) => {
        this.empresas.set(empresas);
        if (empresas.length > 0) {
          this.seleccionarEmpresa(empresas[0]);
        }
      }
    });
  }

  seleccionarEmpresa(empresa: Empresa) {
    this.empresaActual.set(empresa);
    this.cargarProcesos(empresa.id);
  }

  cargarProcesos(empresaId: string) {
    this.procesoService.listar(empresaId).subscribe({
      next: (procesos) => this.procesos.set(procesos)
    });
  }

  crearProceso() {
    const empresa = this.empresaActual();
    if (!empresa) return;
    this.procesoService.crear({
      nombre: this.newNombre,
      descripcion: this.newDescripcion,
      empresaId: empresa.id
    }).subscribe({
      next: (proceso) => {
        this.router.navigate(['/diagramador', proceso.id]);
      }
    });
  }

  abrirDiagramador(proceso: Proceso) {
    this.router.navigate(['/diagramador', proceso.id]);
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  getEstadoColor(estado: string): string {
    switch (estado) {
      case 'BORRADOR': return 'accent';
      case 'PUBLICADO': return 'primary';
      case 'ARCHIVADO': return 'warn';
      default: return '';
    }
  }
}
