import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';

@Component({
  selector: 'orq-setup-empresa',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './setup-empresa.html',
  styleUrl: './setup-empresa.scss'
})
export class SetupEmpresa {
  nombre = '';
  descripcion = '';
  rubro = '';
  loading = signal(false);
  error = signal('');

  rubros = [
    'Tecnología', 'Salud', 'Educación', 'Finanzas', 'Manufactura',
    'Retail / Comercio', 'Construcción', 'Energía', 'Transporte / Logística',
    'Gobierno / Sector Público', 'Otro'
  ];

  constructor(private auth: AuthService, private router: Router) {
    // Si ya tiene empresa, no debería estar aquí
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
    } else if (!this.auth.needsSetup()) {
      this.router.navigate(['/dashboard']);
    }
  }

  onSetup() {
    this.loading.set(true);
    this.error.set('');

    this.auth.setupEmpresa({
      nombre: this.nombre,
      descripcion: this.descripcion,
      rubro: this.rubro
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error || 'Error al crear la empresa');
      }
    });
  }
}
