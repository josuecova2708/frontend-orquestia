import { Component, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';
import { AuthService } from '../../../shared/services/auth';
import { DocumentoService } from '../../../shared/services/documento';
import { ProcesoService } from '../../../shared/services/proceso';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { Documento, Proceso, UsuarioResponse, InstanciaProceso } from '../../../shared/models/interfaces';

type VistaActual =
  | { tipo: 'inicio' }
  | { tipo: 'corporativos' }
  | { tipo: 'proceso'; procesoId: string; nombre: string }
  | { tipo: 'cliente'; clienteId: string; nombre: string }
  | { tipo: 'instancia'; instanciaId: string; clienteNombre: string };

@Component({
  selector: 'orq-sgd-page',
  standalone: true,
  imports: [
    CommonModule, DatePipe, FormsModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule,
    TopNavbarComponent
  ],
  templateUrl: './sgd-page.html',
  styleUrl: './sgd-page.scss'
})
export class SgdPage implements OnInit {

  // ── Datos crudos ──────────────────────────────────────────────────────────
  todosLosDocs  = signal<Documento[]>([]);
  procesos      = signal<Proceso[]>([]);
  clientes      = signal<UsuarioResponse[]>([]);
  instanciasMap = signal<Record<string, InstanciaProceso[]>>({}); // clienteId → instancias

  // ── Estado del árbol sidebar ──────────────────────────────────────────────
  procesosExpanded = signal(true);
  clientesExpanded = signal(true);
  clienteExpandido = signal<string | null>(null); // qué cliente tiene sus instancias abiertas

  // ── Vista actual (panel derecho) ──────────────────────────────────────────
  vista = signal<VistaActual>({ tipo: 'inicio' });

  // ── Upload ────────────────────────────────────────────────────────────────
  subiendo  = signal(false);
  progreso  = signal(0);
  errorMsg  = signal('');

  // ── Búsqueda ──────────────────────────────────────────────────────────────
  busqueda = signal('');

  // ── Documentos filtrados según vista + búsqueda ───────────────────────────
  documentosFiltrados = computed(() => {
    const v = this.vista();
    const q = this.busqueda().toLowerCase();
    let docs: Documento[] = [];

    if (v.tipo === 'corporativos') {
      docs = this.todosLosDocs().filter(d => d.tipo === 'CORPORATIVO' || !d.instanciaId);
    } else if (v.tipo === 'proceso') {
      docs = this.todosLosDocs().filter(d => d.procesoId === v.procesoId);
    } else if (v.tipo === 'cliente') {
      docs = this.todosLosDocs().filter(d => d.clienteId === v.clienteId);
    } else if (v.tipo === 'instancia') {
      docs = this.todosLosDocs().filter(d => d.instanciaId === v.instanciaId);
    } else {
      docs = this.todosLosDocs();
    }

    if (q) docs = docs.filter(d => d.nombre.toLowerCase().includes(q));
    return docs;
  });

  // ── Título del panel derecho ──────────────────────────────────────────────
  tituloPanelDerecho = computed(() => {
    const v = this.vista();
    switch (v.tipo) {
      case 'inicio':       return 'Todos los documentos';
      case 'corporativos': return 'Documentos corporativos';
      case 'proceso':      return `Proceso: ${v.nombre}`;
      case 'cliente':      return `Cliente: ${v.nombre}`;
      case 'instancia':    return `Trámite de ${v.clienteNombre}`;
    }
  });

  // ── Procesos únicos que tienen documentos ─────────────────────────────────
  procesosConDocs = computed(() => {
    const ids = new Set(this.todosLosDocs().map(d => d.procesoId).filter(Boolean));
    return this.procesos().filter(p => ids.has(p.id));
  });

  // ── Clientes únicos que tienen documentos ─────────────────────────────────
  clientesConDocs = computed(() => {
    const ids = new Set(this.todosLosDocs().map(d => d.clienteId).filter(Boolean));
    return this.clientes().filter(c => ids.has(c.id));
  });

  contarCorporativos = computed(() =>
    this.todosLosDocs().filter(d => d.tipo === 'CORPORATIVO' || !d.instanciaId).length
  );

  esAdmin = computed(() => this.auth.user()?.rol === 'ADMIN');

  // IDs de instancias con documentos visibles — para filtrar sidebar por funcionario
  instanciaIdsMisDocs = computed(() =>
    new Set(this.todosLosDocs().map(d => d.instanciaId).filter(Boolean) as string[])
  );

  constructor(
    public auth: AuthService,
    private docService: DocumentoService,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    private motorService: MotorService,
    private router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;

    // Admin ve todos los docs de la empresa; funcionario solo los de sus instancias asignadas
    if (this.esAdmin()) {
      this.docService.listarPorEmpresa(empresaId).subscribe({
        next: docs => this.todosLosDocs.set(docs)
      });
      this.apiService.getFuncionarios(empresaId).subscribe({
        next: usuarios => this.clientes.set(usuarios.filter(u => u.rol === 'CLIENTE'))
      });
    } else {
      this.docService.listarMisDocumentos().subscribe({
        next: docs => this.todosLosDocs.set(docs)
      });
    }

    this.procesoService.listar(empresaId).subscribe({
      next: ps => this.procesos.set(ps)
    });
  }

  // ── Navegación del árbol ──────────────────────────────────────────────────

  seleccionarCorporativos() {
    this.vista.set({ tipo: 'corporativos' });
  }

  seleccionarProceso(proceso: Proceso) {
    this.vista.set({ tipo: 'proceso', procesoId: proceso.id, nombre: proceso.nombre });
  }

  toggleCliente(cliente: UsuarioResponse) {
    if (this.clienteExpandido() === cliente.id) {
      this.clienteExpandido.set(null);
    } else {
      this.clienteExpandido.set(cliente.id);
      this.vista.set({ tipo: 'cliente', clienteId: cliente.id, nombre: `${cliente.nombre} ${cliente.apellido}` });
      this.cargarInstanciasCliente(cliente.id);
    }
  }

  seleccionarInstancia(inst: InstanciaProceso, clienteNombre: string) {
    this.vista.set({ tipo: 'instancia', instanciaId: inst.id, clienteNombre });
  }

  instanciasDeCliente(clienteId: string): InstanciaProceso[] {
    return this.instanciasMap()[clienteId] ?? [];
  }

  private cargarInstanciasCliente(clienteId: string) {
    if (this.instanciasMap()[clienteId]) return;
    this.motorService.listarInstancias(this.auth.user()?.empresaId!).subscribe({
      next: instancias => {
        const visibles = this.instanciaIdsMisDocs();
        const delCliente = instancias.filter(i =>
          i.clienteId === clienteId &&
          (this.esAdmin() || visibles.has(i.id))
        );
        this.instanciasMap.update(m => ({ ...m, [clienteId]: delCliente }));
      }
    });
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  seleccionarArchivo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.xlsx,.pptx,.doc,.xls,.txt,.png,.jpg,.jpeg,.mp4,.webm';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.subirDocumento(file);
    };
    input.click();
  }

  subirDocumento(file: File) {
    const empresaId = this.auth.user()?.empresaId ?? '';
    const v = this.vista();
    const instanciaId = v.tipo === 'instancia' ? v.instanciaId : undefined;
    const tipo = (v.tipo === 'corporativos' || !instanciaId)
      ? 'CORPORATIVO' as const
      : 'TAREA' as const;

    this.subiendo.set(true);
    this.progreso.set(10);
    this.errorMsg.set('');

    this.docService.iniciarUpload({ nombre: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, empresaId, instanciaId, tipo }).subscribe({
      next: (res) => {
        this.progreso.set(40);
        this.docService.subirAMinio(res.uploadUrl, file).subscribe({
          next: () => {
            this.progreso.set(100);
            setTimeout(() => {
              this.subiendo.set(false);
              this.progreso.set(0);
              this.recargarDocs();
            }, 600);
          },
          error: () => { this.subiendo.set(false); this.errorMsg.set('Error al subir a almacenamiento.'); }
        });
      },
      error: () => { this.subiendo.set(false); this.errorMsg.set('Error al registrar el documento.'); }
    });
  }

  // ── Acciones sobre documentos ─────────────────────────────────────────────

  descargar(doc: Documento) {
    this.docService.obtenerUrlDescarga(doc.id).subscribe({
      next: res => window.open(res.url, '_blank')
    });
  }

  abrirEditor(doc: Documento) {
    this.router.navigate(['/editor-documento', doc.id]);
  }

  eliminar(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return;
    this.docService.eliminar(doc.id).subscribe({
      next: () => this.todosLosDocs.update(list => list.filter(d => d.id !== doc.id))
    });
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────

  esEditable(doc: Documento): boolean {
    const ext = doc.nombre.split('.').pop()?.toLowerCase() ?? '';
    return ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'odt', 'ods'].includes(ext);
  }

  iconoPorDoc(doc: Documento): string {
    const ext = doc.nombre.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['docx','doc','odt','txt','rtf'].includes(ext)) return 'article';
    if (['xlsx','xls','ods','csv'].includes(ext)) return 'table_chart';
    if (['pptx','ppt','odp'].includes(ext)) return 'slideshow';
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) return 'image';
    if (['mp4','webm','avi'].includes(ext)) return 'videocam';
    return 'insert_drive_file';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private recargarDocs() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.docService.listarPorEmpresa(empresaId).subscribe({
      next: docs => this.todosLosDocs.set(docs)
    });
  }
}
