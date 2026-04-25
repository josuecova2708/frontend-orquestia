import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Nodo, Conexion } from '../models/interfaces';

export interface GenerarDiagramaRequest {
  descripcion: string;
  departamentos_existentes: { id: string; nombre: string }[];
}

export interface DiagramaIaResponse {
  nodos: Nodo[];
  conexiones: Conexion[];
  departamentos_sugeridos: string[];
}

@Injectable({ providedIn: 'root' })
export class IaService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8001';

  generarDiagrama(request: GenerarDiagramaRequest): Observable<DiagramaIaResponse> {
    return this.http.post<DiagramaIaResponse>(`${this.baseUrl}/ia/generar-diagrama`, request);
  }
}
