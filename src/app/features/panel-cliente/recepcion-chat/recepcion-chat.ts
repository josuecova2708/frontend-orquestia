import { Component, OnInit, computed, signal, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../shared/services/auth';
import { ProcesoService } from '../../../shared/services/proceso';
import { DocumentoService } from '../../../shared/services/documento';
import { MotorService } from '../../../shared/services/motor';
import { IaService, ChatMensaje } from '../../../shared/services/ia.service';
import { Proceso, RequisitoDocumento } from '../../../shared/models/interfaces';
import { acceptDe, archivoPermitido, etiquetaTipos } from '../../../shared/utils/tipos-archivo';

interface SlotDocumento {
  documentoId?: string;
  nombreArchivo?: string;
  subiendo: boolean;
  error?: string;
}

@Component({
  selector: 'orq-recepcion-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './recepcion-chat.html',
  styleUrl: './recepcion-chat.scss'
})
export class RecepcionChat implements OnInit {

  @ViewChild('scrollChat') scrollChat?: ElementRef<HTMLDivElement>;

  // ── Catálogo de trámites ────────────────────────────────────────────────────
  procesos = signal<Proceso[]>([]);
  cargandoProcesos = signal(true);

  // ── Chat ────────────────────────────────────────────────────────────────────
  mensajes = signal<ChatMensaje[]>([]);
  entrada = '';
  pensando = signal(false);

  // Sugerencias del agente
  opciones    = signal<{ id: string; nombre: string }[]>([]);
  recomendado = signal<Proceso | null>(null);

  // ── Voz ─────────────────────────────────────────────────────────────────────
  grabando      = signal(false);
  transcribiendo = signal(false);
  private mediaRecorder?: MediaRecorder;
  private audioChunks: BlobPart[] = [];

  // ── Selección + documentos ──────────────────────────────────────────────────
  procesoSeleccionado = signal<Proceso | null>(null);
  slots = signal<Record<number, SlotDocumento>>({});
  iniciando = signal(false);
  errorInicio = signal('');

  // Lista visible: si hay proceso seleccionado mostramos la vista de documentos
  enVistaDocumentos = computed(() => this.procesoSeleccionado() !== null);

  requisitos = computed<RequisitoDocumento[]>(() =>
    this.procesoSeleccionado()?.documentosRequeridos ?? []
  );

  // Habilita "Iniciar trámite" cuando todos los obligatorios tienen documento
  puedeIniciar = computed(() => {
    const reqs = this.requisitos();
    const s = this.slots();
    return reqs.every((r, i) => !r.obligatorio || !!s[i]?.documentoId);
  });

  constructor(
    public auth: AuthService,
    private procesoService: ProcesoService,
    private docService: DocumentoService,
    private motor: MotorService,
    private ia: IaService,
    public router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.cargandoProcesos.set(false); return; }

    this.procesoService.listarPublicos(empresaId).subscribe({
      next: ps => { this.procesos.set(ps); this.cargandoProcesos.set(false); },
      error: () => this.cargandoProcesos.set(false)
    });

    this.mensajes.set([{
      rol: 'agente',
      mensaje: '¡Hola! Soy tu asistente de recepción. Cuéntame qué necesitas hacer y te guío al trámite correcto. También puedes elegirlo directamente de la lista.'
    }]);
  }

  // ── Envío de mensajes ───────────────────────────────────────────────────────

  enviar() {
    const texto = this.entrada.trim();
    if (!texto || this.pensando()) return;

    this.mensajes.update(m => [...m, { rol: 'usuario', mensaje: texto }]);
    this.entrada = '';
    this.opciones.set([]);
    this.recomendado.set(null);
    this.scrollAbajo();
    this.consultarAgente();
  }

  private consultarAgente() {
    const historial = this.historialParaEnvio();
    if (historial.length === 0) return;

    this.pensando.set(true);
    this.ia.clasificarTramite({
      historial,
      procesos: this.procesos().map(p => ({
        id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? ''
      }))
    }).subscribe({
      next: r => {
        this.pensando.set(false);
        this.mensajes.update(m => [...m, { rol: 'agente', mensaje: r.respuesta }]);
        this.opciones.set(r.opciones ?? []);
        this.recomendado.set(
          r.proceso_recomendado_id
            ? this.procesos().find(p => p.id === r.proceso_recomendado_id) ?? null
            : null
        );
        this.scrollAbajo();
      },
      error: () => {
        this.pensando.set(false);
        this.mensajes.update(m => [...m, {
          rol: 'agente',
          mensaje: 'Disculpa, tuve un problema para procesar tu mensaje. ¿Puedes intentarlo de nuevo?'
        }]);
        this.scrollAbajo();
      }
    });
  }

  // El backend exige que el historial empiece con un mensaje de usuario
  private historialParaEnvio(): ChatMensaje[] {
    const msgs = this.mensajes();
    const i = msgs.findIndex(m => m.rol === 'usuario');
    return i === -1 ? [] : msgs.slice(i);
  }

  // ── Voz ─────────────────────────────────────────────────────────────────────

  async toggleGrabacion() {
    if (this.grabando()) { this.detenerGrabacion(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.transcribir(blob);
      };
      this.mediaRecorder.start();
      this.grabando.set(true);
    } catch {
      this.mensajes.update(m => [...m, {
        rol: 'agente',
        mensaje: 'No pude acceder al micrófono. Revisa los permisos del navegador o escríbeme tu mensaje.'
      }]);
    }
  }

  private detenerGrabacion() {
    this.grabando.set(false);
    this.transcribiendo.set(true);
    this.mediaRecorder?.stop();
  }

  private transcribir(blob: Blob) {
    this.ia.transcribirAudio(blob).subscribe({
      next: ({ texto }) => {
        this.transcribiendo.set(false);
        if (texto) { this.entrada = this.entrada ? `${this.entrada} ${texto}` : texto; this.enviar(); }
      },
      error: () => this.transcribiendo.set(false)
    });
  }

  // ── Selección de proceso ────────────────────────────────────────────────────

  seleccionarProcesoPorId(id: string) {
    const p = this.procesos().find(x => x.id === id);
    if (p) this.seleccionarProceso(p);
  }

  seleccionarProceso(p: Proceso) {
    this.procesoSeleccionado.set(p);
    this.slots.set({});
    this.errorInicio.set('');
  }

  volverAlChat() {
    this.procesoSeleccionado.set(null);
  }

  // ── Subida de documentos requeridos ─────────────────────────────────────────

  seleccionarArchivo(index: number, req: RequisitoDocumento) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptDe(req.mimeTypesPermitidos);
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!archivoPermitido(file, req.mimeTypesPermitidos)) {
        this.actualizarSlot(index, { subiendo: false, error: `Tipo no permitido. Permitidos: ${etiquetaTipos(req.mimeTypesPermitidos)}` });
        return;
      }
      this.subirDocumento(index, file);
    };
    input.click();
  }

  private subirDocumento(index: number, file: File) {
    const empresaId = this.auth.user()?.empresaId ?? '';
    const procesoId = this.procesoSeleccionado()?.id;

    this.actualizarSlot(index, { subiendo: true, error: undefined });

    this.docService.iniciarUpload({
      nombre: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      empresaId,
      procesoId,
      tipo: 'ENTRADA'
    }).subscribe({
      next: res => {
        this.docService.subirAMinio(res.uploadUrl, file).subscribe({
          next: () => this.actualizarSlot(index, {
            subiendo: false, documentoId: res.documentoId, nombreArchivo: file.name
          }),
          error: () => this.actualizarSlot(index, { subiendo: false, error: 'Error al subir el archivo.' })
        });
      },
      error: () => this.actualizarSlot(index, { subiendo: false, error: 'Error al registrar el documento.' })
    });
  }

  quitarDocumento(index: number) {
    this.slots.update(s => { const n = { ...s }; delete n[index]; return n; });
  }

  private actualizarSlot(index: number, patch: Partial<SlotDocumento>) {
    this.slots.update(s => ({ ...s, [index]: { ...(s[index] ?? { subiendo: false }), ...patch } }));
  }

  // ── Iniciar el trámite ──────────────────────────────────────────────────────

  iniciarTramite() {
    const proceso = this.procesoSeleccionado();
    if (!proceso || !this.puedeIniciar() || this.iniciando()) return;

    const documentoIds = Object.values(this.slots())
      .map(s => s.documentoId)
      .filter((id): id is string => !!id);

    this.iniciando.set(true);
    this.errorInicio.set('');
    this.motor.iniciarTramite(proceso.id, documentoIds).subscribe({
      next: () => {
        this.iniciando.set(false);
        this.router.navigate(['/panel-cliente'], { queryParams: { iniciado: '1' } });
      },
      error: err => {
        this.iniciando.set(false);
        this.errorInicio.set(err?.error?.message ?? 'No se pudo iniciar el trámite. Revisa los documentos e intenta de nuevo.');
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private scrollAbajo() {
    setTimeout(() => {
      const el = this.scrollChat?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  iconoArchivo(nombre?: string): string {
    const ext = nombre?.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
    if (['doc', 'docx', 'odt'].includes(ext)) return 'article';
    return 'insert_drive_file';
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
