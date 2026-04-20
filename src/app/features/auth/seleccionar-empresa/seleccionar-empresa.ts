import { Component, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../shared/services/auth';
import { EmpresaResumen } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-seleccionar-empresa',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule],
  templateUrl: './seleccionar-empresa.html',
  styleUrl: './seleccionar-empresa.scss'
})
export class SelectorEmpresa {

  empresas = computed<EmpresaResumen[]>(() => this.auth.user()?.empresasAdmin ?? []);
  seleccionando = signal<string | null>(null);

  // Formulario nueva empresa
  showForm = signal(false);
  nombre = '';
  descripcion = '';
  rubro = '';
  creando = signal(false);
  error = signal('');

  rubros = [
    'Tecnología', 'Salud', 'Educación', 'Finanzas', 'Manufactura',
    'Retail / Comercio', 'Construcción', 'Energía', 'Transporte / Logística',
    'Gobierno / Sector Público', 'Otro'
  ];

  constructor(public auth: AuthService, private router: Router) {}

  seleccionar(empresa: EmpresaResumen) {
    this.seleccionando.set(empresa.id);
    this.auth.switchEmpresa(empresa.id).subscribe({
      next: () => {
        this.seleccionando.set(null);
        this.router.navigate(['/dashboard']);
      },
      error: () => this.seleccionando.set(null)
    });
  }

  crearEmpresa() {
    if (!this.nombre.trim() || !this.rubro) return;
    this.creando.set(true);
    this.error.set('');
    this.auth.setupEmpresa({ nombre: this.nombre, descripcion: this.descripcion, rubro: this.rubro }).subscribe({
      next: () => {
        this.creando.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.creando.set(false);
        this.error.set(err.error?.error || 'Error al crear la empresa');
      }
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
