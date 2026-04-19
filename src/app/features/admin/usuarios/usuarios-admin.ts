import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { UsuarioResponse, Departamento } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-usuarios-admin',
  standalone: true,
  imports: [
    FormsModule, MatToolbarModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule
  ],
  templateUrl: './usuarios-admin.html',
  styleUrl: './usuarios-admin.scss'
})
export class UsuariosAdmin implements OnInit {

  funcionarios = signal<UsuarioResponse[]>([]);
  departamentos = signal<Departamento[]>([]);
  loading = signal(true);
  guardando = signal(false);

  showForm = signal(false);
  form = { email: '', password: '', nombre: '', apellido: '', departamentoId: '' };
  formError = signal('');

  constructor(
    public auth: AuthService,
    private api: ApiService,
    public router: Router
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    if (!user?.empresaId) { this.router.navigate(['/dashboard']); return; }

    this.api.getFuncionarios(user.empresaId).subscribe({
      next: (list) => { this.funcionarios.set(list.filter(u => u.rol === 'FUNCIONARIO')); this.loading.set(false); }
    });

    this.api.getDepartamentos(user.empresaId).subscribe({
      next: (d) => this.departamentos.set(d)
    });
  }

  abrirFormulario() {
    this.form = { email: '', password: '', nombre: '', apellido: '', departamentoId: '' };
    this.formError.set('');
    this.showForm.set(true);
  }

  crearFuncionario() {
    if (!this.form.email || !this.form.password || !this.form.nombre || !this.form.apellido) {
      this.formError.set('Completa todos los campos obligatorios.');
      return;
    }
    this.guardando.set(true);
    this.formError.set('');
    this.api.crearFuncionario(this.form).subscribe({
      next: (u) => {
        this.funcionarios.update(list => [...list, u]);
        this.showForm.set(false);
        this.guardando.set(false);
      },
      error: (err) => {
        this.formError.set(err.error?.message ?? 'Error al crear el funcionario.');
        this.guardando.set(false);
      }
    });
  }

  cambiarDepartamento(userId: string, departamentoId: string) {
    this.api.actualizarFuncionario(userId, { departamentoId }).subscribe({
      next: (u) => this.funcionarios.update(list => list.map(f => f.id === u.id ? u : f))
    });
  }

  desactivar(userId: string) {
    this.api.actualizarFuncionario(userId, { activo: false }).subscribe({
      next: (u) => this.funcionarios.update(list => list.map(f => f.id === u.id ? u : f))
    });
  }

  getNombreDepto(deptoId: string | null): string {
    if (!deptoId) return '— Sin asignar —';
    return this.departamentos().find(d => d.id === deptoId)?.nombre ?? deptoId;
  }
}
