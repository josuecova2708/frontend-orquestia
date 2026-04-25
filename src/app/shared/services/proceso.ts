import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { Proceso } from '../models/interfaces';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProcesoService {

  private baseUrl = `${environment.apiUrl}/api/procesos`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  listar(empresaId: string) {
    return this.http.get<Proceso[]>(`${this.baseUrl}?empresaId=${empresaId}`, { headers: this.headers() });
  }

  obtener(id: string) {
    return this.http.get<Proceso>(`${this.baseUrl}/${id}`, { headers: this.headers() });
  }

  crear(data: { nombre: string; descripcion: string; empresaId: string }) {
    return this.http.post<Proceso>(this.baseUrl, data, { headers: this.headers() });
  }

  guardar(id: string, data: Partial<Proceso>) {
    return this.http.put<Proceso>(`${this.baseUrl}/${id}`, data, { headers: this.headers() });
  }

  publicar(id: string) {
    return this.http.post<Proceso>(`${this.baseUrl}/${id}/publicar`, {}, { headers: this.headers() });
  }

  archivar(id: string) {
    return this.http.post<Proceso>(`${this.baseUrl}/${id}/archivar`, {}, { headers: this.headers() });
  }

  crearNuevaVersion(id: string) {
    return this.http.post<Proceso>(`${this.baseUrl}/${id}/nueva-version`, {}, { headers: this.headers() });
  }

  eliminar(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.headers() });
  }

  listarIniciables(empresaId: string) {
    return this.http.get<Proceso[]>(
      `${this.baseUrl}/iniciables?empresaId=${empresaId}`,
      { headers: this.headers() }
    );
  }

  guardarAsignaciones(id: string, asignaciones: Record<string, string>) {
    return this.http.put<Proceso>(
      `${this.baseUrl}/${id}/asignaciones`,
      asignaciones,
      { headers: this.headers() }
    );
  }
}
