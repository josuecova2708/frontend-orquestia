import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';

@Component({
  selector: 'orq-register-cliente',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register-cliente.html',
  styleUrl: './register-cliente.scss'
})
export class RegisterCliente implements OnInit {
  nombre = '';
  apellido = '';
  email = '';
  password = '';
  confirmPassword = '';
  telefono = '';
  showPassword = false;
  loading = signal(false);
  error = signal('');

  empresaId = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/panel-cliente']);
      return;
    }
    this.empresaId = this.route.snapshot.queryParamMap.get('empresaId') ?? '';
    if (!this.empresaId) {
      this.error.set('Enlace de registro inválido. Solicita un nuevo enlace a la empresa.');
    }
  }

  togglePassword() { this.showPassword = !this.showPassword; }

  onRegister() {
    if (!this.empresaId) return;
    if (this.password !== this.confirmPassword) {
      this.error.set('Las contraseñas no coinciden');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.registerCliente({
      nombre: this.nombre,
      apellido: this.apellido,
      email: this.email,
      password: this.password,
      telefono: this.telefono || undefined
    }, this.empresaId).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/panel-cliente']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error || 'Error al crear la cuenta');
      }
    });
  }
}
