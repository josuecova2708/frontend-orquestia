/**
 * Modelos TypeScript que representan los datos del backend.
 * Estos son los "tipos" que TypeScript usa para evitar errores.
 */

export interface Notificacion {
  id: string;
  userId: string;
  tipo: 'TAREA_ASIGNADA' | 'DEPT_INVITACION' | 'PROCESO_ASIGNADO';
  mensaje: string;
  leida: boolean;
  fecha: string;
  metadata: Record<string, unknown>;
}

export interface EmpresaResumen {
  id: string;
  nombre: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: 'ADMIN' | 'DISEÑADOR' | 'FUNCIONARIO' | 'CLIENTE';
  empresaId: string | null;
  departamentoId: string | null;
  empresasAdmin?: EmpresaResumen[];
}

export interface UsuarioResponse {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: 'ADMIN' | 'DISEÑADOR' | 'FUNCIONARIO' | 'CLIENTE';
  empresaId: string;
  departamentoId: string | null;
  activo: boolean;
  fechaCreacion: string;
}

export interface RequisitoDocumento {
  nombre: string;
  descripcion: string;
  mimeTypesPermitidos: string[];
  obligatorio: boolean;
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
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'OPCIONES' | 'CASILLAS' | 'FECHA' | 'ARCHIVO' | 'GRID';
  label: string;       // Texto visible
  requerido: boolean;
  opciones?: string[]; // Para tipo OPCIONES (selección única) y CASILLAS (selección múltiple)
  mimeTypesPermitidos?: string[]; // Solo para tipo ARCHIVO: extensiones permitidas (vacío = todo)
  columnas?: string[]; // Solo para tipo GRID: encabezados de columna
  filas?: number;      // Solo para tipo GRID: número de filas
}

export interface Nodo {
  id: string;
  tipo: 'INICIO' | 'FIN' | 'ACTIVIDAD' | 'GATEWAY_XOR' | 'GATEWAY_AND';
  label: string;
  descripcion?: string;
  departamentoId?: string;
  responsableCliente?: boolean;    // true = la actividad la realiza el cliente (autoservicio)
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
  /** departamentoId → userId: quién ejecuta las tareas de ese depto en este proceso */
  asignaciones: Record<string, string>;
  habilitadoParaClientes: boolean;
  documentosRequeridos: RequisitoDocumento[];
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
  procesoNombre?: string;
  empresaId: string;
  creadoPor: string;
  creadoPorNombre?: string;
  clienteId?: string;
  estado: 'ACTIVA' | 'COMPLETADA' | 'CANCELADA' | 'ERROR';
  variables: Record<string, unknown>;
  fechaInicio: string;
  fechaFin?: string;
}

export interface TimelineItem {
  nodoLabel: string;
  estado: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA' | 'RECHAZADA';
  fechaCompletado?: string;
}

export interface SeguimientoTramite {
  id: string;
  nombreProceso: string;
  estado: 'ACTIVA' | 'COMPLETADA' | 'CANCELADA' | 'ERROR';
  fechaInicio: string;
  fechaFin?: string;
  timeline: TimelineItem[];
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

// =========================================================================
// SGD — Sistema de Gestión Documental
// =========================================================================

export interface Documento {
  id: string;
  nombre: string;
  mimeType: string;
  size: number;
  key: string;
  url: string;
  empresaId: string;
  instanciaId?: string;
  tareaId?: string;
  procesoId?: string;
  clienteId?: string;
  tareaLabel?: string;
  departamentoId?: string;
  tipo: 'ENTRADA' | 'TAREA' | 'GENERADO' | 'CORPORATIVO';
  creadoPor: string;
  creadoPorNombre: string;
  fechaCreacion: string;
  ultimaEdicion?: string;
  ultimoEditorNombre?: string;
  version?: number;
  versiones?: VersionDocumento[];
  permisos: PermisoDocumento[];
  auditLog: AuditEntry[];
}

export interface VersionDocumento {
  version: number;
  key: string;
  fecha: string;
  editorId?: string;
  editorNombre?: string;
}

export interface PermisoDocumento {
  usuarioId: string;
  usuarioNombre: string;
  tipo: 'LECTURA' | 'ESCRITURA' | 'ADMIN';
}

export interface AuditEntry {
  usuarioId: string;
  usuarioNombre: string;
  accion: string;
  fecha: string;
  detalle: string;
}

export interface IniciarUploadResponse {
  documentoId: string;
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export interface OnlyOfficeConfig {
  documentType: string;
  document: Record<string, unknown>;
  editorConfig: Record<string, unknown>;
  token: string;
}

// =========================================================================
// Módulo BI / Reportes
// =========================================================================

export interface MetricasEmpresa {
  instanciasPorEstado: Record<string, number>;
  cuellosBottela: { nodoLabel: string; avgMinutos: number; total: number }[];
  cargaFuncionarios: { userId: string; pendientes: number }[];
  actividadReciente: { fecha: string; total: number }[];
  tiemposPorProceso: { procesoNombre: string; avgMinutos: number; total: number }[];
}

