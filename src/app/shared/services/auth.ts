import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthResponse } from '../models/interfaces';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private apiUrl = 'http://localhost:8080/api/auth';

  private currentUser = signal<AuthResponse | null>(this.loadUser());

  user = this.currentUser.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());
  token = computed(() => this.currentUser()?.token ?? '');
  // Computed que el guard usa para detectar si necesita onboarding
  needsSetup = computed(() => this.isLoggedIn() && !this.currentUser()?.empresaId);

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
      .pipe(tap(res => this.saveUser(res)));
  }

  register(data: { email: string; password: string; nombre: string; apellido: string }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data)
      .pipe(tap(res => this.saveUser(res)));
  }

  /**
   * Onboarding: crea la empresa y actualiza el token local con el nuevo empresaId.
   * Requiere que el usuario ya esté logueado (tiene token).
   */
  setupEmpresa(data: { nombre: string; descripcion?: string; rubro: string }) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.token()}` });
    return this.http.post<AuthResponse>(`${this.apiUrl}/setup-empresa`, data, { headers })
      .pipe(tap(res => this.saveUser(res))); // Reemplaza el token viejo con el nuevo
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
    try { return JSON.parse(stored); } catch { return null; }
  }
}
