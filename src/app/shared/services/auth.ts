import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthResponse } from '../models/interfaces';
import { tap } from 'rxjs';

/**
 * Servicio de autenticación.
 *
 * Maneja login, registro, y el almacenamiento del token JWT en localStorage.
 * Usa Angular Signals para estado reactivo (el UI se actualiza solo cuando cambia).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  private apiUrl = 'http://localhost:8080/api/auth';

  // Signal = estado reactivo. Cuando cambia, los componentes que lo usan se re-renderizan.
  private currentUser = signal<AuthResponse | null>(this.loadUser());

  // Computed signals — se derivan del currentUser automáticamente
  user = this.currentUser.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());
  token = computed(() => this.currentUser()?.token ?? '');

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
      .pipe(tap(res => this.saveUser(res)));
  }

  register(data: { email: string; password: string; nombre: string; apellido: string; rol?: string }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data)
      .pipe(tap(res => this.saveUser(res)));
  }

  logout() {
    localStorage.removeItem('orquestia_user');
    this.currentUser.set(null);
  }

  private saveUser(user: AuthResponse) {
    localStorage.setItem('orquestia_user', JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): AuthResponse | null {
    const stored = localStorage.getItem('orquestia_user');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
}
