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

@Injectable({ providedIn: 'root' })
export class IaService {
  private http = inject(HttpClient);
  private readonly baseUrl = environment.iaUrl;

  generarDiagrama(request: GenerarDiagramaRequest): Observable<DiagramaIaResponse> {
    return this.http.post<DiagramaIaResponse>(`${this.baseUrl}/ia/generar-diagrama`, request);
  }
}
