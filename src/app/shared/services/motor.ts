import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { InstanciaProceso, TareaInstancia } from '../models/interfaces';

/**
 * Servicio que conecta el frontend con el Motor BPM del backend.
 * Gestiona instancias de proceso y tareas asignadas a funcionarios.
 */
@Injectable({ providedIn: 'root' })
export class MotorService {

  private baseUrl = 'http://localhost:8080/api';

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  // === Instancias ===

  iniciarProceso(procesoId: string, variables: Record<string, unknown> = {}) {
    return this.http.post<InstanciaProceso>(
      `${this.baseUrl}/instancias`,
      { procesoId, variables },
      { headers: this.headers() }
    );
  }

  obtenerInstancia(id: string) {
    return this.http.get<InstanciaProceso>(`${this.baseUrl}/instancias/${id}`, { headers: this.headers() });
  }

  obtenerTareasDeInstancia(instanciaId: string) {
    return this.http.get<TareaInstancia[]>(`${this.baseUrl}/instancias/${instanciaId}/tareas`, { headers: this.headers() });
  }

  // === Tareas (bandeja del funcionario) ===

  obtenerMisTareas() {
    return this.http.get<TareaInstancia[]>(`${this.baseUrl}/mis-tareas`, { headers: this.headers() });
  }

  obtenerMisInstancias() {
    return this.http.get<InstanciaProceso[]>(`${this.baseUrl}/mis-instancias`, { headers: this.headers() });
  }

  iniciarTarea(tareaId: string) {
    return this.http.put<TareaInstancia>(
      `${this.baseUrl}/tareas/${tareaId}/iniciar`, {},
      { headers: this.headers() }
    );
  }

  completarTarea(tareaId: string, datos: Record<string, unknown>, comentario?: string) {
    return this.http.put<TareaInstancia>(
      `${this.baseUrl}/tareas/${tareaId}/completar`,
      { datos, comentario },
      { headers: this.headers() }
    );
  }

  listarInstancias(empresaId: string, estado?: string) {
    let url = `${this.baseUrl}/instancias?empresaId=${empresaId}`;
    if (estado) url += `&estado=${estado}`;
    return this.http.get<InstanciaProceso[]>(url, { headers: this.headers() });
  }

  cancelarInstancia(instanciaId: string) {
    return this.http.delete<void>(
      `${this.baseUrl}/instancias/${instanciaId}`,
      { headers: this.headers() }
    );
  }
}
