import { Component, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, SlicePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../shared/services/auth';
import { MotorService } from '../../../shared/services/motor';
import { DocumentoService } from '../../../shared/services/documento';
import { IaService } from '../../../shared/services/ia.service';
import { InstanciaProceso, SeguimientoTramite, TareaInstancia, CampoFormulario, Documento } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-panel-cliente-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SlicePipe, DatePipe, MatIconModule],
  templateUrl: './panel-cliente-dashboard.html',
  styleUrl: './panel-cliente-dashboard.scss'
})
export class PanelClienteDashboard implements OnInit {
  instancias = signal<InstanciaProceso[]>([]);
  loading = signal(true);
  tramiteIniciado = signal(false);

  // Vista activa del portal: trámites o documentos
  vista = signal<'tramites' | 'documentos'>('tramites');
  documentos = signal<Documento[]>([]);
  cargandoDocs = signal(false);
  docsCargados = false;

  // Seguimiento expandible
  expandido = signal<string | null>(null);
  seguimientos = signal<Record<string, SeguimientoTramite>>({});
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
    if (!this.seguimientos()[inst.id]) {
      this.cargandoSeguimiento.set(inst.id);
      this.motor.trackInstancia(inst.id).subscribe({
        next: (seg) => { this.seguimientos.update(m => ({ ...m, [inst.id]: seg })); this.cargandoSeguimiento.set(null); },
        error: () => this.cargandoSeguimiento.set(null)
      });
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

  subirArchivo(campoNombre: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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
        // refrescar seguimiento abierto si corresponde
        this.seguimientos.update(m => { const n = { ...m }; delete n[accion.instanciaId]; return n; });
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
