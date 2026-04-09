import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth';

@Component({
  selector: 'orq-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  email = '';
  password = '';
  loading = signal(false);
  error = signal('');
  showPassword = false;
  rememberMe = false;

  constructor(private auth: AuthService, private router: Router) {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/dashboard']);
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  onLogin() {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error || 'Error al iniciar sesión');
      }
    });
  }
}
