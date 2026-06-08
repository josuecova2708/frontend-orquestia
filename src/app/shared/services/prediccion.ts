import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { environment } from '../../../environments/environment';

export interface NodoRiesgo {
  tarea_id: string;
  nodo_label: string;
  funcionario: string;
  riesgo: number;                 // 0-1 (salida cruda del modelo)
  duracion_estimada_min: number;  // salida cruda del modelo
  // Features exactas que recibió el modelo (datos en crudo)
  hora_creacion: number;
  dia_semana: number;
  carga_funcionario: number;
  duracion_historica_avg: number;
  intentos: number;
}

export interface ModeloInfo {
  features: string[];
  registros_entrenamiento: number | null;
  val_accuracy: number | null;
  umbral_demora: number;
}

export interface PrediccionResponse {
  instancia_id: string;
  riesgo_global: number;
  duracion_estimada_total_min: number;
  nodos_en_riesgo: NodoRiesgo[];
  tareas: NodoRiesgo[];
  recomendaciones: string[];
  resumen: string;
  modelo_info: ModeloInfo;
}

export interface SeedDemoResponse {
  empresaId: string;
  empresaNombre: string;
  departamentos: number;
  funcionarios: number;
  procesos: number;
  instanciasHistoricas: number;
  instanciasActivas: number;
  passwordDemo: string;
  credenciales: { nombre: string; email: string; departamento: string }[];
}

@Injectable({ providedIn: 'root' })
export class PrediccionService {

  private baseUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  /** Análisis de riesgo de demora de una instancia activa (modelo Deep Learning). */
  predecir(instanciaId: string) {
    return this.http.get<PrediccionResponse>(
      `${this.baseUrl}/instancias/${instanciaId}/prediccion`,
      { headers: this.headers() }
    );
  }

  /** (Re)genera la empresa "Demo Deep Learning" con datos calibrados para la demo. */
  sembrarDemo() {
    return this.http.post<SeedDemoResponse>(
      `${this.baseUrl}/admin/seed-demo`, {},
      { headers: this.headers() }
    );
  }
}
