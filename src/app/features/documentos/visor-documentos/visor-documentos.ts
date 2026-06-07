import { Component, Input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocumentoService } from '../../../shared/services/documento';
import { AuthService } from '../../../shared/services/auth';
import { Documento } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-visor-documentos',
  standalone: true,
  imports: [CommonModule, DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './visor-documentos.html',
  styleUrl: './visor-documentos.scss'
})
export class VisorDocumentos implements OnInit {
  @Input() instanciaId!: string;
  @Input() soloLectura = false;

  documentos = signal<Documento[]>([]);
  cargando = signal(false);
  subiendo = signal(false);
  progreso = signal(0);
  error = signal('');

  constructor(
    private docService: DocumentoService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.docService.listarPorInstancia(this.instanciaId).subscribe({
      next: (docs) => { this.documentos.set(docs); this.cargando.set(false); },
      error: () => { this.cargando.set(false); }
    });
  }

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
    this.subiendo.set(true);
    this.progreso.set(10);
    this.error.set('');

    this.docService.iniciarUpload({
      nombre: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      empresaId,
      instanciaId: this.instanciaId,
      tipo: 'TAREA'
    }).subscribe({
      next: (res) => {
        this.progreso.set(40);
        this.docService.subirAMinio(res.uploadUrl, file).subscribe({
          next: () => {
            this.progreso.set(100);
            setTimeout(() => {
              this.subiendo.set(false);
              this.progreso.set(0);
              this.cargar();
            }, 600);
          },
          error: () => {
            this.subiendo.set(false);
            this.error.set('Error al subir el archivo a almacenamiento.');
          }
        });
      },
      error: () => {
        this.subiendo.set(false);
        this.error.set('Error al registrar el documento.');
      }
    });
  }

  descargar(doc: Documento) {
    this.docService.obtenerUrlDescarga(doc.id).subscribe({
      next: (res) => window.open(res.url, '_blank'),
      error: () => this.error.set('Error al obtener URL de descarga.')
    });
  }

  abrirEditor(doc: Documento) {
    this.router.navigate(['/editor-documento', doc.id]);
  }

  eliminar(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return;
    this.docService.eliminar(doc.id).subscribe({
      next: () => this.documentos.update(list => list.filter(d => d.id !== doc.id)),
      error: () => this.error.set('Error al eliminar el documento.')
    });
  }

  esEditable(doc: Documento): boolean {
    const ext = doc.nombre.split('.').pop()?.toLowerCase() ?? '';
    return ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'odt', 'ods'].includes(ext);
  }

  iconoPorMime(doc: Documento): string {
    const ext = doc.nombre.split('.').pop()?.toLowerCase() ?? '';
    if (['pdf'].includes(ext)) return 'picture_as_pdf';
    if (['docx', 'doc', 'odt', 'txt', 'rtf'].includes(ext)) return 'article';
    if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) return 'table_chart';
    if (['pptx', 'ppt', 'odp'].includes(ext)) return 'slideshow';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'avi'].includes(ext)) return 'videocam';
    return 'insert_drive_file';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
