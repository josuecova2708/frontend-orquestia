/**
 * Modelos TypeScript que representan los datos del backend.
 * Estos son los "tipos" que TypeScript usa para evitar errores.
 */

export interface AuthResponse {
  token: string;
  userId: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: 'ADMIN' | 'DISEÑADOR' | 'FUNCIONARIO';
  empresaId: string | null;
}

export interface Empresa {
  id: string;
  nombre: string;
  descripcion: string;
  rubro: string;
  creadoPor: string;
  activa: boolean;
  fechaCreacion: string;
}

export interface Departamento {
  id: string;
  nombre: string;
  descripcion: string;
  empresaId: string;
  activo: boolean;
}

// Un campo del formulario dinámico embebido en una Actividad
export interface CampoFormulario {
  nombre: string;      // Clave de la variable (ej: "decision")
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'OPCIONES' | 'FECHA';
  label: string;       // Texto visible
  requerido: boolean;
  opciones?: string[]; // Solo para tipo OPCIONES
}

export interface Nodo {
  id: string;
  tipo: 'INICIO' | 'FIN' | 'ACTIVIDAD' | 'GATEWAY_XOR' | 'GATEWAY_AND';
  label: string;
  descripcion?: string;
  departamentoId?: string;
  formulario?: CampoFormulario[];  // Formulario embebido en la actividad
  posX: number;
  posY: number;
}

export interface Conexion {
  id: string;
  origenId: string;
  destinoId: string;
  tipo: 'NORMAL' | 'CONDICIONAL' | 'RETORNO';
  label?: string;
  condicion?: string;
  maxReintentos?: number;
  esDefault: boolean;
}

export interface Proceso {
  id: string;
  nombre: string;
  descripcion: string;
  empresaId: string;
  creadoPor: string;
  estado: 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';
  nodos: Nodo[];
  conexiones: Conexion[];
  version: number;
  fechaCreacion: string;
  fechaModificacion: string;
}

// =========================================================================
// Motor BPM
// =========================================================================

export interface InstanciaProceso {
  id: string;
  procesoId: string;
  empresaId: string;
  creadoPor: string;
  estado: 'ACTIVA' | 'COMPLETADA' | 'CANCELADA' | 'ERROR';
  variables: Record<string, unknown>;
  fechaInicio: string;
  fechaFin?: string;
}

export interface TareaInstancia {
  id: string;
  instanciaId: string;
  nodoId: string;
  nodoLabel: string;
  departamentoId: string;
  asignadoA?: string;
  estado: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'RECHAZADA';
  intentos: number;
  datos: Record<string, unknown>;
  comentario?: string;
  formularioCampos?: CampoFormulario[]; // Inyectado por el motor al crear la tarea
  fechaCreacion: string;
  fechaCompletado?: string;
}

