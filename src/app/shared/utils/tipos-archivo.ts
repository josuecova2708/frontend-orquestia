/**
 * Grupos de tipos de archivo que el admin puede permitir al configurar
 * documentos requeridos o campos ARCHIVO de un formulario.
 *
 * Se almacena la lista plana de extensiones en `mimeTypesPermitidos`.
 * Lista vacía = se permite cualquier tipo.
 */
export interface GrupoTipoArchivo {
  key: string;
  label: string;
  icon: string;
  exts: string[];
}

export const TIPOS_ARCHIVO: GrupoTipoArchivo[] = [
  { key: 'pdf',    label: 'PDF',         icon: 'picture_as_pdf', exts: ['.pdf'] },
  { key: 'word',   label: 'Word',        icon: 'article',        exts: ['.doc', '.docx', '.odt'] },
  { key: 'excel',  label: 'Excel',       icon: 'table_chart',    exts: ['.xls', '.xlsx', '.csv'] },
  { key: 'ppt',    label: 'PowerPoint',  icon: 'slideshow',      exts: ['.ppt', '.pptx'] },
  { key: 'imagen', label: 'Imágenes',    icon: 'image',          exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
  { key: 'video',  label: 'Videos',      icon: 'videocam',       exts: ['.mp4', '.webm', '.mov'] },
];

/** ¿Están todas las extensiones del grupo presentes en la lista? */
export function grupoSeleccionado(lista: string[], grupo: GrupoTipoArchivo): boolean {
  return grupo.exts.every(e => lista.includes(e));
}

/** Agrega/quita las extensiones del grupo y devuelve la nueva lista. */
export function toggleGrupo(lista: string[], grupo: GrupoTipoArchivo): string[] {
  if (grupoSeleccionado(lista, grupo)) {
    return lista.filter(e => !grupo.exts.includes(e));
  }
  return [...new Set([...lista, ...grupo.exts])];
}

/** Valor para el atributo `accept` de un <input type="file">. Vacío = sin restricción. */
export function acceptDe(lista?: string[]): string {
  return lista && lista.length > 0 ? lista.join(',') : '';
}

/** Valida que el archivo tenga una extensión permitida (lista vacía = todo permitido). */
export function archivoPermitido(file: File, lista?: string[]): boolean {
  if (!lista || lista.length === 0) return true;
  const punto = file.name.lastIndexOf('.');
  const ext = punto >= 0 ? file.name.slice(punto).toLowerCase() : '';
  return lista.map(e => e.toLowerCase()).includes(ext);
}

/** Texto legible de los tipos permitidos para mostrar al usuario. */
export function etiquetaTipos(lista?: string[]): string {
  if (!lista || lista.length === 0) return 'Cualquier tipo';
  const grupos = TIPOS_ARCHIVO.filter(g => g.exts.some(e => lista.includes(e))).map(g => g.label);
  return grupos.length > 0 ? grupos.join(', ') : lista.join(', ');
}
