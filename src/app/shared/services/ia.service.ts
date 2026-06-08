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

export interface ChatMensaje {
  rol: 'usuario' | 'agente';
  mensaje: string;
}

export interface ProcesoDisponible {
  id: string;
  nombre: string;
  descripcion: string;
}

export interface ClasificarTramiteRequest {
  historial: ChatMensaje[];
  procesos: ProcesoDisponible[];
}

export interface OpcionProceso {
  id: string;
  nombre: string;
}

export interface ClasificarTramiteResponse {
  respuesta: string;
  proceso_recomendado_id: string | null;
  requiere_aclaracion: boolean;
  opciones: OpcionProceso[];
}

export interface AccionDiagrama {
  tipo: 'asignar_departamento' | 'renombrar' | 'autoservicio' | 'eliminar';
  nodoId: string;
  departamentoId?: string | null;
  nuevoLabel?: string | null;
  valor?: boolean | null;
}

export interface ComandoDiagramaRequest {
  comando: string;
  nodos: { id: string; label: string; tipo: string; departamentoId?: string | null; responsableCliente?: boolean }[];
  departamentos: { id: string; nombre: string }[];
}

export interface ComandoDiagramaResponse {
  acciones: AccionDiagrama[];
  mensaje: string;
}

export interface FuncionarioDisponible {
  id: string;
  nombre: string;
}

export interface ConsultaIaRequest {
  pregunta: string;
  fecha_actual: string;
  procesos: ProcesoDisponible[];
  funcionarios: FuncionarioDisponible[];
}

export interface ConsultaReporteSpec {
  valido: boolean;
  mensaje: string;
  metrica: string | null;
  desde: string | null;
  hasta: string | null;
  estado: string | null;
  proceso_id: string | null;
  funcionario_id: string | null;
  limite: number | null;
  orden: string;
  formato: 'pantalla' | 'pdf' | 'excel';
  titulo: string | null;
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

  clasificarTramite(request: ClasificarTramiteRequest): Observable<ClasificarTramiteResponse> {
    return this.http.post<ClasificarTramiteResponse>(`${this.baseUrl}/ia/clasificar-tramite`, request);
  }

  comandoDiagrama(request: ComandoDiagramaRequest): Observable<ComandoDiagramaResponse> {
    return this.http.post<ComandoDiagramaResponse>(`${this.baseUrl}/ia/comando-diagrama`, request);
  }

  interpretarConsulta(request: ConsultaIaRequest): Observable<ConsultaReporteSpec> {
    return this.http.post<ConsultaReporteSpec>(`${this.baseUrl}/ia/consulta-reporte`, request);
  }
}
