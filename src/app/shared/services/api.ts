import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { Empresa, Departamento, UsuarioResponse } from '../models/interfaces';

/**
 * Servicio genérico para llamadas a la API protegidas con JWT.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {

  private baseUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  // === Empresas ===

  getEmpresas() {
    return this.http.get<Empresa[]>(`${this.baseUrl}/empresas`, { headers: this.headers() });
  }

  getEmpresa(id: string) {
    return this.http.get<Empresa>(`${this.baseUrl}/empresas/${id}`, { headers: this.headers() });
  }

  crearEmpresa(data: { nombre: string; descripcion: string; rubro: string }) {
    return this.http.post<Empresa>(`${this.baseUrl}/empresas`, data, { headers: this.headers() });
  }

  // === Departamentos ===

  getDepartamentos(empresaId: string) {
    return this.http.get<Departamento[]>(
      `${this.baseUrl}/empresas/${empresaId}/departamentos`,
      { headers: this.headers() }
    );
  }

  crearDepartamento(empresaId: string, data: { nombre: string; descripcion: string }) {
    return this.http.post<Departamento>(
      `${this.baseUrl}/empresas/${empresaId}/departamentos`,
      data,
      { headers: this.headers() }
    );
  }

  eliminarDepartamento(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/departamentos/${id}`, { headers: this.headers() });
  }

  // === Uploads MinIO ===

  getPresignUrl(filename: string, contentType: string) {
    return this.http.get<{ uploadUrl: string; publicUrl: string; key: string }>(
      `${this.baseUrl}/uploads/presign`,
      { params: { filename, contentType }, headers: this.headers() }
    );
  }

  // === Usuarios / Funcionarios ===

  getFuncionarios(empresaId: string) {
    return this.http.get<UsuarioResponse[]>(
      `${this.baseUrl}/usuarios?empresaId=${empresaId}`,
      { headers: this.headers() }
    );
  }

  crearFuncionario(data: { email: string; password: string; nombre: string; apellido: string; departamentoId: string }) {
    return this.http.post<UsuarioResponse>(`${this.baseUrl}/usuarios`, data, { headers: this.headers() });
  }

  actualizarFuncionario(id: string, data: { departamentoId?: string; activo?: boolean }) {
    return this.http.put<UsuarioResponse>(`${this.baseUrl}/usuarios/${id}`, data, { headers: this.headers() });
  }
}
