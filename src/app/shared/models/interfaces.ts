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

export interface Nodo {
  id: string;
  tipo: 'INICIO' | 'FIN' | 'ACTIVIDAD' | 'GATEWAY_XOR' | 'GATEWAY_AND';
  label: string;
  descripcion?: string;
  departamentoId?: string;
  formularioId?: string;
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
