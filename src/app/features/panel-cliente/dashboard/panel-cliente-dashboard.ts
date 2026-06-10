import { Component, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../shared/services/auth';
import { MotorService, TramiteDetalle, TramiteTareaDetalle } from '../../../shared/services/motor';
import { DocumentoService } from '../../../shared/services/documento';
import { IaService } from '../../../shared/services/ia.service';
import { NotificacionService } from '../../../shared/services/notificacion.service';
import { WebSocketService } from '../../../shared/services/websocket.service';
import { InstanciaProceso, TareaInstancia, CampoFormulario, Documento, Notificacion } from '../../../shared/models/interfaces';
import { acceptDe, archivoPermitido, etiquetaTipos } from '../../../shared/utils/tipos-archivo';

@Component({
  selector: 'orq-panel-cliente-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SlicePipe, DatePipe, MatIconModule],
  templateUrl: './panel-cliente-dashboard.html',
  styleUrl: './panel-cliente-dashboard.scss'
})
export class PanelClienteDashboard implements OnInit, OnDestroy {
  instancias = signal<InstanciaProceso[]>([]);
  loading = signal(true);
  tramiteIniciado = signal(false);

  // ── Notificaciones + tiempo real (WebSocket) ────────────────────────────────
  notificaciones = signal<Notificacion[]>([]);
  panelNotifAbierto = signal(false);
  aviso = signal('');                  // toast transitorio al recibir un evento
  private wsSub: Subscription | null = null;

  // Vista activa del portal: trámites o documentos
  vista = signal<'tramites' | 'documentos'>('tramites');
  documentos = signal<Documento[]>([]);
  cargandoDocs = signal(false);
  docsCargados = false;

  // Documentos agrupados por trámite (con nombre del proceso y fecha)
  documentosAgrupados = computed(() => {
    const instMap = new Map(this.instancias().map(i => [i.id, i]));
    const grupos = new Map<string, { procesoNombre: string; fecha?: string; docs: Documento[] }>();
    for (const d of this.documentos()) {
      const key = d.instanciaId ?? '__otros__';
      if (!grupos.has(key)) {
        const inst = d.instanciaId ? instMap.get(d.instanciaId) : undefined;
        grupos.set(key, {
          procesoNombre: inst?.procesoNombre ?? (d.instanciaId ? 'Trámite' : 'Otros documentos'),
          fecha: inst?.fechaInicio,
          docs: []
        });
      }
      grupos.get(key)!.docs.push(d);
    }
    return Array.from(grupos.values());
  });

  // Seguimiento expandible (detalle con formularios llenados)
  expandido = signal<string | null>(null);
  detalles = signal<Record<string, TramiteDetalle>>({});
  cargandoSeguimiento = signal<string | null>(null);

  // ── Acciones pendientes (tareas de autoservicio) ────────────────────────────
  acciones = signal<TareaInstancia[]>([]);

  // Modal de acción
  accionActiva = signal<TareaInstancia | null>(null);
  campos = signal<CampoFormulario[]>([]);
  respuestas: Record<string, unknown> = {};
  comentario = '';
  guardando = signal(false);
  errorAccion = signal('');
  uploadEstados = signal<Record<string, 'idle' | 'uploading' | 'done' | 'error'>>({});

  // Asistencia por voz
  grabandoCampo = signal<string | null>(null);
  transcribiendoCampo = signal<string | null>(null);
  private mediaRecorder?: MediaRecorder;
  private audioChunks: BlobPart[] = [];

  constructor(
    public auth: AuthService,
    private motor: MotorService,
    private docService: DocumentoService,
    private ia: IaService,
    private notifService: NotificacionService,
    private wsService: WebSocketService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (this.route.snapshot.queryParamMap.get('iniciado') === '1') {
      this.tramiteIniciado.set(true);
      setTimeout(() => this.tramiteIniciado.set(false), 6000);
    }

    this.cargarTramites();
    this.cargarAcciones();
    this.cargarNotificaciones();

    // Tiempo real: avisos cuando un funcionario avanza o finaliza el trámite del cliente
    const user = this.auth.user();
    const token = this.auth.token();
    if (user && token) {
      this.wsSub = this.wsService.conectarUsuario(user.userId, token).subscribe(evento => {
        if (evento.tipo === 'TRAMITE_AVANZO' || evento.tipo === 'TRAMITE_FINALIZADO') {
          this.aviso.set(evento.tipo === 'TRAMITE_FINALIZADO'
            ? '¡Tu trámite fue completado!'
            : `Avanzó tu trámite: ${evento['nodoLabel'] ?? 'una actividad'}`);
          setTimeout(() => this.aviso.set(''), 6000);
          this.refrescarTodo(evento['instanciaId'] as string | undefined);
        }
      });
    }
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
    this.wsService.desconectarUsuario();
  }

  /** Refresca trámites, acciones, notificaciones y el detalle abierto (si aplica). */
  private refrescarTodo(instanciaId?: string) {
    this.cargarTramites();
    this.cargarAcciones();
    this.cargarNotificaciones();
    if (instanciaId && this.expandido() === instanciaId) {
      this.cargarDetalle(instanciaId);
    }
  }

  private cargarTramites() {
    this.motor.misTramites().subscribe({
      next: (data) => { this.instancias.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private cargarAcciones() {
    this.motor.misAcciones().subscribe({
      next: (data) => this.acciones.set(data)
    });
  }

  iniciarTramite() {
    this.router.navigate(['/recepcion']);
  }

  // ── Cambio de vista ─────────────────────────────────────────────────────────

  verTramites() { this.vista.set('tramites'); }

  verDocumentos() {
    this.vista.set('documentos');
    if (!this.docsCargados) {
      this.cargandoDocs.set(true);
      this.docService.listarMisDocumentosCliente().subscribe({
        next: (docs) => { this.documentos.set(docs); this.docsCargados = true; this.cargandoDocs.set(false); },
        error: () => this.cargandoDocs.set(false)
      });
    }
  }

  descargarDoc(doc: Documento) {
    this.docService.obtenerUrlDescarga(doc.id).subscribe({
      next: (res) => window.open(res.url, '_blank')
    });
  }

  iconoDoc(nombre: string): string {
    const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    if (['doc', 'docx', 'odt'].includes(ext)) return 'article';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart';
    return 'insert_drive_file';
  }

  etiquetaTipoDoc(tipo: string): string {
    switch (tipo) {
      case 'ENTRADA':  return 'Documento inicial';
      case 'TAREA':    return 'Subido en el trámite';
      case 'GENERADO': return 'Generado por la empresa';
      default:         return tipo;
    }
  }

  // ── Seguimiento ─────────────────────────────────────────────────────────────

  toggleSeguimiento(inst: InstanciaProceso) {
    if (this.expandido() === inst.id) { this.expandido.set(null); return; }
    this.expandido.set(inst.id);
    if (!this.detalles()[inst.id]) {
      this.cargarDetalle(inst.id);
    }
  }

  private cargarDetalle(instanciaId: string) {
    this.cargandoSeguimiento.set(instanciaId);
    this.motor.obtenerDetalleTramite(instanciaId).subscribe({
      next: (det) => { this.detalles.update(m => ({ ...m, [instanciaId]: det })); this.cargandoSeguimiento.set(null); },
      error: () => this.cargandoSeguimiento.set(null)
    });
  }

  // ── Notificaciones ──────────────────────────────────────────────────────────

  private cargarNotificaciones() {
    this.notifService.listar().subscribe({
      next: (list) => this.notificaciones.set(list)
    });
  }

  get noLeidas(): number {
    return this.notificaciones().filter(n => !n.leida).length;
  }

  togglePanelNotif() { this.panelNotifAbierto.update(v => !v); }
  cerrarPanelNotif() { this.panelNotifAbierto.set(false); }

  leerNotificacion(n: Notificacion) {
    if (n.leida) return;
    this.notifService.marcarLeida(n.id).subscribe({
      next: (upd) => this.notificaciones.update(list => list.map(x => x.id === n.id ? upd : x))
    });
  }

  leerTodas() {
    this.notifService.marcarTodasLeidas().subscribe({
      next: () => this.notificaciones.update(list => list.map(n => ({ ...n, leida: true })))
    });
  }

  iconoNotif(tipo: string): string {
    switch (tipo) {
      case 'TRAMITE_FINALIZADO': return 'task_alt';
      case 'TRAMITE_AVANZO':     return 'trending_up';
      default:                   return 'notifications';
    }
  }

  iconoPaso(estado: string): string {
    switch (estado) {
      case 'COMPLETADA':  return 'check_circle';
      case 'EN_PROGRESO': return 'autorenew';
      case 'RECHAZADA':   return 'cancel';
      default:            return 'radio_button_unchecked';
    }
  }

  // ── Render de los formularios llenados por cada funcionario ──────────────────

  /** Pares {label, valor} de lo que llenó el funcionario, ocultando variables internas. */
  datosDeTarea(t: TramiteTareaDetalle): { label: string; valor: unknown }[] {
    const labels = new Map((t.formularioCampos ?? []).map(c => [c.nombre, c.label]));
    return Object.entries(t.datos ?? {})
      .filter(([k]) => !k.startsWith('__'))   // ocultar internos (ej. __retorno_)
      .map(([k, valor]) => ({ label: labels.get(k) ?? k, valor }));
  }

  esGrid(val: unknown): boolean {
    return Array.isArray(val) && val.length > 0 && Array.isArray(val[0]);
  }
  asGrid(val: unknown): string[][] {
    return val as string[][];
  }
  esArchivo(val: unknown): boolean {
    return typeof val === 'string' && val.startsWith('http');
  }
  formatValor(val: unknown): string {
    if (val === null || val === undefined || val === '') return '—';
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    return String(val);
  }

  // ── Acciones de autoservicio ────────────────────────────────────────────────

  abrirAccion(accion: TareaInstancia) {
    this.accionActiva.set(accion);
    this.respuestas = {};
    this.comentario = '';
    this.errorAccion.set('');
    this.uploadEstados.set({});
    const campos = accion.formularioCampos ?? [];
    this.campos.set(campos.length > 0 ? campos
      : [{ nombre: 'confirmacion', tipo: 'BOOLEANO', label: 'Confirmo esta acción', requerido: true }]);
    this.inicializarGrids();
  }

  // ── GRID (tabla NxN) ──────────────────────────────────────────────────────
  private inicializarGrids() {
    this.campos().forEach(c => {
      if (c.tipo === 'GRID' && !this.respuestas[c.nombre]) {
        this.respuestas = { ...this.respuestas, [c.nombre]: this.nuevaMatriz(c) };
      }
    });
  }
  private nuevaMatriz(campo: CampoFormulario): string[][] {
    const filas = campo.filas ?? 1;
    const cols = campo.columnas?.length || 1;
    return Array.from({ length: filas }, () => Array.from({ length: cols }, () => ''));
  }
  rangoFilas(campo: CampoFormulario): number[] {
    return Array.from({ length: campo.filas ?? 1 }, (_, i) => i);
  }
  celdaGrid(campo: CampoFormulario, f: number, c: number): string {
    const m = this.respuestas[campo.nombre] as string[][] | undefined;
    return m?.[f]?.[c] ?? '';
  }
  setCeldaGrid(campo: CampoFormulario, f: number, c: number, valor: string) {
    let m = (this.respuestas[campo.nombre] as string[][] | undefined) ?? this.nuevaMatriz(campo);
    m = m.map(row => [...row]);
    m[f][c] = valor;
    this.respuestas = { ...this.respuestas, [campo.nombre]: m };
  }

  cerrarAccion() {
    this.accionActiva.set(null);
    this.campos.set([]);
  }

  getRespuesta(campo: string): string {
    return (this.respuestas[campo] as string) ?? '';
  }

  setRespuesta(campo: string, value: unknown) {
    this.respuestas = { ...this.respuestas, [campo]: value };
  }

  getUploadEstado(campo: string): string {
    return this.uploadEstados()[campo] ?? 'idle';
  }

  acceptCampo(campo: CampoFormulario): string {
    return acceptDe(campo.mimeTypesPermitidos);
  }

  subirArchivo(campoNombre: string, event: Event, campo?: CampoFormulario) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (campo && !archivoPermitido(file, campo.mimeTypesPermitidos)) {
      this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }));
      this.errorAccion.set(`Tipo no permitido. Permitidos: ${etiquetaTipos(campo.mimeTypesPermitidos)}`);
      input.value = '';
      return;
    }

    const accion = this.accionActiva();
    const empresaId = this.auth.user()?.empresaId ?? '';
    this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'uploading' }));

    // Se registra como Documento vinculado a la instancia → aparece en el SGD y en "Mis documentos"
    this.docService.iniciarUpload({
      nombre: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      empresaId,
      instanciaId: accion?.instanciaId,
      tareaId: accion?.id,
      tipo: 'TAREA'
    }).subscribe({
      next: (res) => {
        this.docService.subirAMinio(res.uploadUrl, file).subscribe({
          next: () => {
            this.setRespuesta(campoNombre, res.publicUrl);
            this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'done' }));
          },
          error: () => this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }))
        });
      },
      error: () => this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }))
    });
  }

  enviarAccion() {
    const accion = this.accionActiva();
    if (!accion || this.guardando()) return;

    const haySubiendo = this.campos().some(c => c.tipo === 'ARCHIVO' && this.getUploadEstado(c.nombre) === 'uploading');
    if (haySubiendo) { this.errorAccion.set('Espera a que terminen de subirse los archivos.'); return; }

    const incompleto = this.campos().some(c => {
      if (!c.requerido) return false;
      const v = this.respuestas[c.nombre];
      return v === undefined || v === null || v === '';
    });
    if (incompleto) { this.errorAccion.set('Completa todos los campos requeridos.'); return; }

    this.guardando.set(true);
    this.errorAccion.set('');
    this.motor.completarAccion(accion.id, this.respuestas, this.comentario).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarAccion();
        this.cargarAcciones();
        this.cargarTramites();
        // Invalida el detalle cacheado; si está abierto, lo recarga.
        this.detalles.update(m => { const n = { ...m }; delete n[accion.instanciaId]; return n; });
        if (this.expandido() === accion.instanciaId) this.cargarDetalle(accion.instanciaId);
      },
      error: (err) => {
        this.guardando.set(false);
        this.errorAccion.set(err?.error?.message ?? 'No se pudo completar la acción.');
      }
    });
  }

  // ── Asistencia por voz en campos de texto ───────────────────────────────────

  async toggleGrabacion(campoNombre: string) {
    if (this.grabandoCampo() === campoNombre) { this.detenerGrabacion(campoNombre); return; }
    if (this.grabandoCampo()) this.detenerGrabacion(this.grabandoCampo()!);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.transcribiendoCampo.set(campoNombre);
        this.ia.transcribirAudio(blob).subscribe({
          next: ({ texto }) => {
            this.transcribiendoCampo.set(null);
            if (texto) {
              const actual = this.getRespuesta(campoNombre);
              this.setRespuesta(campoNombre, actual ? `${actual} ${texto}` : texto);
            }
          },
          error: () => this.transcribiendoCampo.set(null)
        });
      };
      this.mediaRecorder.start();
      this.grabandoCampo.set(campoNombre);
    } catch {
      this.errorAccion.set('No se pudo acceder al micrófono.');
    }
  }

  private detenerGrabacion(campoNombre: string) {
    this.grabandoCampo.set(null);
    this.mediaRecorder?.stop();
    void campoNombre;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      ACTIVA: 'badge--activa',
      COMPLETADA: 'badge--completada',
      CANCELADA: 'badge--cancelada',
      ERROR: 'badge--error'
    };
    return map[estado] ?? '';
  }
}
