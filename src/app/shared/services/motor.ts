import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { InstanciaProceso, TareaInstancia, SeguimientoTramite } from '../models/interfaces';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MotorService {

  private baseUrl = `${environment.apiUrl}/api`;

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

  // Inicia un trámite como CLIENTE: valida documentos requeridos y los vincula a la instancia
  iniciarTramite(procesoId: string, documentoIds: string[], variables: Record<string, unknown> = {}) {
    return this.http.post<InstanciaProceso>(
      `${this.baseUrl}/cliente/iniciar-tramite`,
      { procesoId, documentoIds, variables },
      { headers: this.headers() }
    );
  }

  // Trámites iniciados por el cliente autenticado
  misTramites() {
    return this.http.get<InstanciaProceso[]>(
      `${this.baseUrl}/cliente/mis-tramites`,
      { headers: this.headers() }
    );
  }

  // Seguimiento (timeline de pasos) de un trámite — endpoint público, sin datos sensibles
  trackInstancia(instanciaId: string) {
    return this.http.get<SeguimientoTramite>(`${this.baseUrl}/public/instancias/${instanciaId}`);
  }

  // Acciones de autoservicio pendientes del cliente (aceptar condiciones, firmar, etc.)
  misAcciones() {
    return this.http.get<TareaInstancia[]>(
      `${this.baseUrl}/cliente/mis-acciones`,
      { headers: this.headers() }
    );
  }

  completarAccion(tareaId: string, datos: Record<string, unknown>, comentario?: string) {
    return this.http.post<TareaInstancia>(
      `${this.baseUrl}/cliente/acciones/${tareaId}/completar`,
      { datos, comentario },
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
