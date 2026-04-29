import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { MetricasEmpresa } from '../models/interfaces';
import { environment } from '../../../environments/environment';

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
}
