import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthResponse } from '../models/interfaces';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private apiUrl = `${environment.apiUrl}/api/auth`;

  private currentUser = signal<AuthResponse | null>(this.loadUser());

  user = this.currentUser.asReadonly();
  isLoggedIn = computed(() => !!this.currentUser());
  token = computed(() => this.currentUser()?.token ?? '');

  // True when logged in, has empresas but no active selection (multi-admin login)
  needsSelection = computed(() => {
    const u = this.currentUser();
    return !!u && (!u.empresaId || u.empresaId === '') && (u.empresasAdmin?.length ?? 0) > 0;
  });

  // True when logged in but has no empresa at all (brand new user)
  needsSetup = computed(() => {
    const u = this.currentUser();
    return !!u && (!u.empresaId || u.empresaId === '') && (u.empresasAdmin?.length ?? 0) === 0;
  });

  constructor(private http: HttpClient) {}

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password })
      .pipe(tap(res => this.saveUser(res)));
  }

  register(data: { email: string; password: string; nombre: string; apellido: string }) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data)
      .pipe(tap(res => this.saveUser(res)));
  }

  setupEmpresa(data: { nombre: string; descripcion?: string; rubro: string }) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.token()}` });
    return this.http.post<AuthResponse>(`${this.apiUrl}/setup-empresa`, data, { headers })
      .pipe(tap(res => this.saveUser(res)));
  }

  switchEmpresa(empresaId: string) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.token()}` });
    return this.http.post<AuthResponse>(`${this.apiUrl}/switch-empresa/${empresaId}`, {}, { headers })
      .pipe(tap(res => this.saveUser(res)));
  }

  invitarAdmin(data: { email: string; nombre: string; apellido: string; password: string; empresaId: string }) {
    const headers = new HttpHeaders({ Authorization: `Bearer ${this.token()}` });
    return this.http.post<AuthResponse>(`${this.apiUrl}/invitar-admin`, data, { headers });
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
