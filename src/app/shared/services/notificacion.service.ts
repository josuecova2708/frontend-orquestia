import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth';
import { Notificacion } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class NotificacionService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly base = 'http://localhost:8080/api/notificaciones';

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  listar(): Observable<Notificacion[]> {
    return this.http.get<Notificacion[]>(this.base, { headers: this.headers() });
  }

  marcarLeida(id: string): Observable<Notificacion> {
    return this.http.put<Notificacion>(`${this.base}/${id}/leer`, {}, { headers: this.headers() });
  }

  marcarTodasLeidas(): Observable<void> {
    return this.http.put<void>(`${this.base}/leer-todas`, {}, { headers: this.headers() });
  }
}
