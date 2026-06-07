import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocumentoService } from '../../../shared/services/documento';
import { OnlyOfficeConfig } from '../../../shared/models/interfaces';
import { environment } from '../../../../environments/environment';

declare const DocsAPI: any;

@Component({
  selector: 'orq-editor-onlyoffice',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './editor-onlyoffice.html',
  styleUrl: './editor-onlyoffice.scss'
})
export class EditorOnlyoffice implements OnInit, OnDestroy {
  cargando = signal(true);
  error = signal('');
  private editor: any = null;
  private scriptEl: HTMLScriptElement | null = null;

  readonly onlyOfficeUrl = environment.onlyOfficeUrl ?? 'https://office-orquestia.duckdns.org';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private docService: DocumentoService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const soloLectura = this.route.snapshot.queryParamMap.get('ver') === '1';
    this.cargarEditor(id, soloLectura);
  }

  private cargarEditor(id: string, soloLectura: boolean) {
    this.docService.obtenerEditorConfig(id, soloLectura).subscribe({
      next: (config) => this.inicializarOnlyOffice(config),
      error: () => {
        this.cargando.set(false);
        this.error.set('No se pudo cargar la configuración del documento.');
      }
    });
  }

  private inicializarOnlyOffice(config: OnlyOfficeConfig) {
    const apiUrl = `${this.onlyOfficeUrl}/web-apps/apps/api/documents/api.js`;

    if ((window as any).DocsAPI) {
      this.crearEditor(config);
      return;
    }

    this.scriptEl = document.createElement('script');
    this.scriptEl.src = apiUrl;
    this.scriptEl.onload = () => this.crearEditor(config);
    this.scriptEl.onerror = () => {
      this.cargando.set(false);
      this.error.set('No se pudo conectar con el servidor OnlyOffice.');
    };
    document.head.appendChild(this.scriptEl);
  }

  private crearEditor(config: OnlyOfficeConfig) {
    this.cargando.set(false);
    this.editor = new DocsAPI.DocEditor('onlyoffice-container', {
      documentType: config.documentType,
      document: config.document,
      editorConfig: config.editorConfig,
      token: config.token,
      height: '100%',
      width: '100%',
      events: {
        onError: (event: any) => console.error('OnlyOffice error:', event)
      }
    });
  }

  volver() {
    history.back();
  }

  ngOnDestroy() {
    if (this.editor?.destroyEditor) {
      this.editor.destroyEditor();
    }
  }
}
