import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { Empresa, Departamento } from '../models/interfaces';

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

  // === Departamentos ===

  getDepartamentos(empresaId: string) {
    return this.http.get<Departamento[]>(
      `${this.baseUrl}/empresas/${empresaId}/departamentos`,
      { headers: this.headers() }
    );
  }
}
