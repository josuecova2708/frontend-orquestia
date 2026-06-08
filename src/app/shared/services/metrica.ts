import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { MetricasEmpresa } from '../models/interfaces';
import { environment } from '../../../environments/environment';

export interface ConsultaReporteRequest {
  empresaId: string;
  metrica: string;
  desde?: string | null;
  hasta?: string | null;
  estado?: string | null;
  procesoId?: string | null;
  funcionarioId?: string | null;
  limite?: number | null;
  orden?: string | null;
  titulo?: string | null;
}

export interface ConsultaReporteResponse {
  titulo: string;
  metrica: string;
  columnas: string[];
  filas: (string | number)[][];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class MetricaService {

  private baseUrl = `${environment.apiUrl}/api/metricas`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  getMetricas(empresaId: string, desde?: string, hasta?: string) {
    let url = `${this.baseUrl}?empresaId=${empresaId}`;
    if (desde) url += `&desde=${desde}`;
    if (hasta) url += `&hasta=${hasta}`;
    return this.http.get<MetricasEmpresa>(url, { headers: this.headers() });
  }

  consulta(request: ConsultaReporteRequest) {
    return this.http.post<ConsultaReporteResponse>(`${this.baseUrl}/consulta`, request, { headers: this.headers() });
  }
}
