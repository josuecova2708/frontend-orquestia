import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { Departamento, UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';
import { ConfirmModalService } from '../../../shared/services/confirm-modal.service';

@Component({
  selector: 'orq-departamentos-page',
  standalone: true,
  imports: [
    MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule,
    TopNavbarComponent
  ],
  templateUrl: './departamentos-page.html',
  styleUrl: './departamentos-page.scss'
})
export class DepartamentosPage implements OnInit {
  departamentos = signal<Departamento[]>([]);
  funcionarios  = signal<UsuarioResponse[]>([]);

  showCreateDepto = signal(false);
  newDeptoNombre  = '';
  newDeptoDesc    = '';
  savingDepto     = signal(false);

  constructor(
    public auth: AuthService,
    private apiService: ApiService,
    public router: Router,
    private modal: ConfirmModalService
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.router.navigate(['/setup-empresa']); return; }
    this.apiService.getDepartamentos(empresaId).subscribe({ next: (d) => this.departamentos.set(d) });
    this.apiService.getFuncionarios(empresaId).subscribe({
      next: (f) => this.funcionarios.set(f.filter(u => u.rol === 'FUNCIONARIO' && u.activo))
    });
  }

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
        this.newDeptoDesc   = '';
        this.savingDepto.set(false);
      },
      error: () => this.savingDepto.set(false)
    });
  }

  async eliminarDepartamento(id: string) {
    const ok = await this.modal.confirm(
      'Los funcionarios asignados a este departamento no serán eliminados.',
      '¿Eliminar este departamento?'
    );
    if (!ok) return;
    this.apiService.eliminarDepartamento(id).subscribe({
      next: () => this.departamentos.update(list => list.filter(d => d.id !== id))
    });
  }

  getFuncionariosDeDept(deptId: string): UsuarioResponse[] {
    return this.funcionarios().filter(f => f.departamentoId === deptId);
  }
}
