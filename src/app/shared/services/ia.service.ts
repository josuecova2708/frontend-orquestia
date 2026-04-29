import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Nodo, Conexion } from '../models/interfaces';
import { environment } from '../../../environments/environment';

export interface GenerarDiagramaRequest {
  descripcion: string;
  departamentos_existentes: { id: string; nombre: string }[];
}

export interface DiagramaIaResponse {
  nodos: Nodo[];
  conexiones: Conexion[];
  departamentos_sugeridos: string[];
}

export interface OptimizarDiagramaRequest {
  nodos: Nodo[];
  conexiones: Conexion[];
  departamentos: { id: string; nombre: string }[];
}

export interface OptimizarDiagramaResponse {
  nodos: Nodo[];
  conexiones: Conexion[];
  cambios_realizados: string[];
}

@Injectable({ providedIn: 'root' })
export class IaService {
  private http = inject(HttpClient);
  private readonly baseUrl = environment.iaUrl;

  generarDiagrama(request: GenerarDiagramaRequest): Observable<DiagramaIaResponse> {
    return this.http.post<DiagramaIaResponse>(`${this.baseUrl}/ia/generar-diagrama`, request);
  }

  optimizarDiagrama(request: OptimizarDiagramaRequest): Observable<OptimizarDiagramaResponse> {
    return this.http.post<OptimizarDiagramaResponse>(`${this.baseUrl}/ia/optimizar-diagrama`, request);
  }

  transcribirAudio(blob: Blob): Observable<{ texto: string }> {
    const form = new FormData();
    form.append('audio', blob, 'grabacion.webm');
    return this.http.post<{ texto: string }>(`${this.baseUrl}/ia/transcribir-audio`, form);
  }
}
