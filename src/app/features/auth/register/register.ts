import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';

@Component({
  selector: 'orq-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  nombre = '';
  apellido = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  loading = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) {
      this.redirectAfterLogin();
    }
  }

  togglePassword() { this.showPassword = !this.showPassword; }

  onRegister() {
    if (this.password !== this.confirmPassword) {
      this.error.set('Las contraseñas no coinciden');
      return;
    }
    if (this.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.register({
      nombre: this.nombre,
      apellido: this.apellido,
      email: this.email,
      password: this.password
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.redirectAfterLogin();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error || 'Error al crear la cuenta');
      }
    });
  }

  private redirectAfterLogin() {
    if (this.auth.needsSetup()) {
      this.router.navigate(['/setup-empresa']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
