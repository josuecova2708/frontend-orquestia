import {
  Component, OnInit, OnDestroy, AfterViewInit,
  signal, ViewChild, ElementRef
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../../shared/services/auth';
import { MetricaService } from '../../../shared/services/metrica';
import { ApiService } from '../../../shared/services/api';
import { ProcesoService } from '../../../shared/services/proceso';
import { IaService, ConsultaReporteSpec } from '../../../shared/services/ia.service';
import { MetricasEmpresa, UsuarioResponse, Proceso } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';
import { Chart, registerables } from 'chart.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

Chart.register(...registerables);

/** Una tarjeta de reporte ya generada (consulta + datos tabulares). */
interface ResultadoReporte {
  consulta: string;
  titulo: string;
  metrica: string;
  criterios: string[];
  columnas: string[];
  filas: (string | number)[][];
  total: number;
}

@Component({
  selector: 'orq-reportes-page',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatMenuModule, TopNavbarComponent],
  templateUrl: './reportes-page.html',
  styleUrl: './reportes-page.scss'
})
export class ReportesPage implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('chartEstado')    canvasEstado!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartCuello')    canvasCuello!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartCarga')     canvasCarga!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartActividad') canvasActividad!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartProcesos')  canvasProcesos!: ElementRef<HTMLCanvasElement>;

  metricas     = signal<MetricasEmpresa | null>(null);
  cargando     = signal(true);
  error        = signal(false);
  fechaDesde   = signal('');
  fechaHasta   = signal('');
  filtroActivo = signal(false);

  funcionarios: UsuarioResponse[] = [];
  procesos: Proceso[] = [];

  // ── Generador de reportes por consulta (NLP) ─────────────────────────────────
  consultaTexto   = signal('');
  consultando     = signal(false);
  errorConsulta   = signal('');           // mensaje de error o de consulta no soportada
  resultados      = signal<ResultadoReporte[]>([]);
  grabando        = signal(false);
  transcribiendo  = signal(false);
  exportando      = signal(false);

  readonly consultasSugeridas = [
    'Funcionarios con más actividades en junio, en PDF',
    'Tiempos promedio por proceso este mes',
    'Top 5 cuellos de botella',
    'Ejecuciones por estado en Excel',
  ];

  private mediaRecorder?: MediaRecorder;
  private audioChunks: BlobPart[] = [];

  private charts: Chart[] = [];
  private dataReady = false;
  private viewReady = false;

  constructor(
    public auth: AuthService,
    private metricaService: MetricaService,
    private apiService: ApiService,
    private procesoService: ProcesoService,
    private ia: IaService,
    public router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.apiService.getFuncionarios(empresaId).subscribe({ next: f => { this.funcionarios = f; } });
    this.procesoService.listar(empresaId).subscribe({ next: p => { this.procesos = p; } });
    this.cargarMetricas();
  }

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.dataReady) setTimeout(() => this.buildCharts(), 0);
  }

  ngOnDestroy() { this.charts.forEach(c => c.destroy()); }

  private cargarMetricas(desde?: string, hasta?: string) {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.cargando.set(true);
    this.error.set(false);
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this.dataReady = false;

    this.metricaService.getMetricas(empresaId, desde, hasta).subscribe({
      next: (m) => {
        this.metricas.set(m);
        this.cargando.set(false);
        this.dataReady = true;
        if (this.viewReady) setTimeout(() => this.buildCharts(), 0);
      },
      error: () => { this.cargando.set(false); this.error.set(true); }
    });
  }

  aplicarFiltro() {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();
    if (!desde && !hasta) { this.limpiarFiltro(); return; }
    this.filtroActivo.set(true);
    this.cargarMetricas(desde || undefined, hasta || undefined);
  }

  limpiarFiltro() {
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.filtroActivo.set(false);
    this.cargarMetricas();
  }

  filtrarHoy() {
    const hoy = this.toDateStr(new Date());
    this.fechaDesde.set(hoy);
    this.fechaHasta.set(hoy);
    this.filtroActivo.set(true);
    this.cargarMetricas(hoy, hoy);
  }

  filtrarSemana() {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const desde = this.toDateStr(lunes);
    const hasta = this.toDateStr(hoy);
    this.fechaDesde.set(desde);
    this.fechaHasta.set(hasta);
    this.filtroActivo.set(true);
    this.cargarMetricas(desde, hasta);
  }

  recargar() { this.limpiarFiltro(); }

  onFechaDesde(e: Event) { this.fechaDesde.set((e.target as HTMLInputElement).value); }
  onFechaHasta(e: Event) { this.fechaHasta.set((e.target as HTMLInputElement).value); }

  private toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }

  getNombreUsuario(userId: string): string {
    const f = this.funcionarios.find(u => u.id === userId);
    return f ? `${f.nombre} ${f.apellido}` : userId.slice(-6);
  }

  private buildCharts() {
    const m = this.metricas()!;
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // ── 1. Doughnut: Estado ─────────────────────────────────────────────────
    const estadoLabels = Object.keys(m.instanciasPorEstado);
    const estadoData   = Object.values(m.instanciasPorEstado);
    const estadoColors: Record<string, string> = {
      COMPLETADA: '#22c55e', ACTIVA: '#3b82f6', CANCELADA: '#94a3b8', ERROR: '#ef4444'
    };
    this.charts.push(new Chart(this.canvasEstado.nativeElement, {
      type: 'doughnut',
      data: { labels: estadoLabels, datasets: [{ data: estadoData, backgroundColor: estadoLabels.map(l => estadoColors[l] ?? '#cbd5e1'), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '65%', maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 11 } } } } }
    }));

    // ── 2. Bar: Cuello de botella ───────────────────────────────────────────
    if (this.canvasCuello?.nativeElement) {
      this.charts.push(new Chart(this.canvasCuello.nativeElement, {
        type: 'bar',
        data: { labels: m.cuellosBottela.map(c => c.nodoLabel), datasets: [{ label: 'Tiempo promedio (min)', data: m.cuellosBottela.map(c => c.avgMinutos), backgroundColor: '#f59e0b', borderRadius: 4 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }

    // ── 3. Bar: Carga por funcionario ───────────────────────────────────────
    if (this.canvasCarga?.nativeElement) {
      this.charts.push(new Chart(this.canvasCarga.nativeElement, {
        type: 'bar',
        data: { labels: m.cargaFuncionarios.map(c => this.getNombreUsuario(c.userId)), datasets: [{ label: 'Tareas pendientes', data: m.cargaFuncionarios.map(c => c.pendientes), backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }

    // ── 4. Line: Actividad reciente ─────────────────────────────────────────
    const actLabels = m.actividadReciente.map(a => { const [, mm, dd] = a.fecha.split('-'); return `${dd}/${mm}`; });
    this.charts.push(new Chart(this.canvasActividad.nativeElement, {
      type: 'line',
      data: { labels: actLabels, datasets: [{ label: 'Ejecuciones iniciadas', data: m.actividadReciente.map(a => a.total), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: true }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } } } }
    }));

    // ── 5. Bar: Procesos más lentos ─────────────────────────────────────────
    if (this.canvasProcesos?.nativeElement && m.tiemposPorProceso?.length > 0) {
      this.charts.push(new Chart(this.canvasProcesos.nativeElement, {
        type: 'bar',
        data: { labels: m.tiemposPorProceso.map(p => p.procesoNombre), datasets: [{ label: 'Duración promedio (min)', data: m.tiemposPorProceso.map(p => p.avgMinutos), backgroundColor: '#ec4899', borderRadius: 4 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#f1f5f9' } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } } }
      }));
    }
  }

  get totalInstancias(): number {
    const m = this.metricas();
    if (!m) return 0;
    return Object.values(m.instanciasPorEstado).reduce((a, b) => a + b, 0);
  }

  get tasaExito(): string {
    const m = this.metricas();
    if (!m || this.totalInstancias === 0) return '—';
    const completadas = m.instanciasPorEstado['COMPLETADA'] ?? 0;
    return ((completadas / this.totalInstancias) * 100).toFixed(1) + '%';
  }

  get activas(): number { return this.metricas()?.instanciasPorEstado['ACTIVA'] ?? 0; }

  get avgCuello(): string {
    const m = this.metricas();
    if (!m || m.cuellosBottela.length === 0) return '—';
    const avg = m.cuellosBottela.reduce((s, c) => s + c.avgMinutos, 0) / m.cuellosBottela.length;
    return avg < 60 ? avg.toFixed(0) + ' min' : (avg / 60).toFixed(1) + ' h';
  }

  get procesoPlusLento(): string {
    const m = this.metricas();
    if (!m || !m.tiemposPorProceso?.length) return '—';
    const max = m.tiemposPorProceso[0].avgMinutos;
    return max < 60 ? max.toFixed(0) + ' min' : (max / 60).toFixed(1) + ' h';
  }

  // ─── Generador de reportes por consulta ──────────────────────────────────────

  private nombreEmpresa(): string | undefined {
    const u = this.auth.user();
    if (!u?.empresaId) return undefined;
    return u.empresasAdmin?.find(e => e.id === u.empresaId)?.nombre;
  }

  getNombreProceso(procesoId: string): string {
    return this.procesos.find(p => p.id === procesoId)?.nombre ?? procesoId;
  }

  private etiquetaMetrica(metrica: string | null): string {
    switch (metrica) {
      case 'actividades_completadas_por_funcionario': return 'Actividades por funcionario';
      case 'carga_pendiente_por_funcionario': return 'Carga pendiente';
      case 'cuellos_de_botella': return 'Cuellos de botella';
      case 'tiempos_por_proceso': return 'Tiempos por proceso';
      case 'ejecuciones_por_proceso': return 'Ejecuciones por proceso';
      case 'ejecuciones_por_estado': return 'Ejecuciones por estado';
      case 'actividad_diaria': return 'Actividad diaria';
      default: return 'Reporte';
    }
  }

  /** Construye los chips de criterios aplicados a partir de la spec del agente. */
  private criteriosDe(spec: ConsultaReporteSpec): string[] {
    const chips: string[] = [this.etiquetaMetrica(spec.metrica)];
    if (spec.desde || spec.hasta) {
      chips.push(`${spec.desde ?? '...'} → ${spec.hasta ?? '...'}`);
    } else {
      chips.push('Histórico completo');
    }
    if (spec.estado) chips.push(`Estado: ${spec.estado}`);
    if (spec.proceso_id) chips.push(`Proceso: ${this.getNombreProceso(spec.proceso_id)}`);
    if (spec.funcionario_id) chips.push(`Funcionario: ${this.getNombreUsuario(spec.funcionario_id)}`);
    if (spec.limite) chips.push(`Top ${spec.limite}`);
    chips.push(spec.orden === 'asc' ? 'Ascendente' : 'Descendente');
    return chips;
  }

  usarSugerida(consulta: string) {
    if (this.consultando()) return;
    this.consultaTexto.set(consulta);
    this.consultar();
  }

  consultar() {
    const q = this.consultaTexto().trim();
    if (!q || this.consultando()) return;

    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;

    this.consultando.set(true);
    this.errorConsulta.set('');

    const fechaActual = new Date().toISOString().slice(0, 10);

    this.ia.interpretarConsulta({
      pregunta: q,
      fecha_actual: fechaActual,
      procesos: this.procesos.map(p => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion ?? '' })),
      funcionarios: this.funcionarios.map(f => ({ id: f.id, nombre: `${f.nombre} ${f.apellido}` })),
    }).subscribe({
      next: (spec) => {
        if (!spec.valido || !spec.metrica) {
          this.consultando.set(false);
          this.errorConsulta.set(spec.mensaje || 'No pude interpretar esa consulta. Intenta reformularla.');
          return;
        }
        this.ejecutarConsulta(q, spec, empresaId);
      },
      error: () => {
        this.consultando.set(false);
        this.errorConsulta.set('No pude procesar la consulta en este momento. Intenta de nuevo.');
      },
    });
  }

  private ejecutarConsulta(consulta: string, spec: ConsultaReporteSpec, empresaId: string) {
    this.metricaService.consulta({
      empresaId,
      metrica: spec.metrica!,
      desde: spec.desde,
      hasta: spec.hasta,
      estado: spec.estado,
      procesoId: spec.proceso_id,
      funcionarioId: spec.funcionario_id,
      limite: spec.limite,
      orden: spec.orden,
      titulo: spec.titulo,
    }).subscribe({
      next: (res) => {
        const resultado: ResultadoReporte = {
          consulta,
          titulo: res.titulo,
          metrica: res.metrica,
          criterios: this.criteriosDe(spec),
          columnas: res.columnas,
          filas: res.filas,
          total: res.total,
        };
        this.resultados.update(r => [resultado, ...r]);
        this.consultaTexto.set('');
        this.consultando.set(false);

        // Si la consulta pidió un formato, se exporta automáticamente.
        if (spec.formato === 'pdf') this.exportarTablaPdf(resultado);
        else if (spec.formato === 'excel') this.exportarTablaExcel(resultado);
      },
      error: () => {
        this.consultando.set(false);
        this.errorConsulta.set('No pude calcular el reporte. Intenta de nuevo.');
      },
    });
  }

  quitarResultado(index: number) {
    this.resultados.update(r => r.filter((_, i) => i !== index));
  }

  limpiarResultados() {
    this.resultados.set([]);
    this.errorConsulta.set('');
  }

  // ─── Exportación de una tabla de resultado ────────────────────────────────────

  exportarTablaPdf(r: ResultadoReporte) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    let y = 16;
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(r.titulo, 14, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const meta = `${this.nombreEmpresa() ?? 'Orquestia'}  ·  ${new Date().toLocaleString('es')}`;
    doc.text(meta, 14, y);
    y += 5;
    const crit = doc.splitTextToSize('Criterios: ' + r.criterios.join('  ·  '), pageW - 28);
    doc.text(crit, 14, y);
    y += crit.length * 4 + 3;
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: y,
      head: [r.columnas],
      body: r.filas.map(f => f.map(c => String(c))),
      theme: 'striped',
      headStyles: { fillColor: [124, 58, 237] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`${this.slug(r.titulo)}-${stamp}.pdf`);
  }

  exportarTablaExcel(r: ResultadoReporte) {
    const wb = XLSX.utils.book_new();
    const cab: (string | number)[][] = [
      [r.titulo],
      ['Criterios', r.criterios.join(' · ')],
      ['Generado', new Date().toLocaleString('es')],
      [],
      r.columnas,
      ...r.filas,
    ];
    const ws = XLSX.utils.aoa_to_sheet(cab);
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${this.slug(r.titulo)}-${stamp}.xlsx`);
  }

  private slug(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'reporte';
  }

  // ─── Voz ──────────────────────────────────────────────────────────────────────

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
      this.errorConsulta.set('No pude acceder al micrófono. Revisa los permisos del navegador.');
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
        if (texto) {
          this.consultaTexto.set(this.consultaTexto() ? `${this.consultaTexto()} ${texto}` : texto);
          this.consultar();
        }
      },
      error: () => this.transcribiendo.set(false),
    });
  }

  // ─── Exportación del dashboard completo ───────────────────────────────────────

  private rangoTexto(): string {
    return this.filtroActivo()
      ? `${this.fechaDesde() || '...'} a ${this.fechaHasta() || '...'}`
      : 'Histórico completo';
  }

  private minLegible(min: number): string {
    return min < 60 ? `${min.toFixed(0)} min` : `${(min / 60).toFixed(1)} h`;
  }

  exportarPdf() {
    const m = this.metricas();
    if (!m) return;
    this.exportando.set(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 16;

      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(`Reporte de Procesos · ${this.nombreEmpresa() ?? 'Orquestia'}`, 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text(`Generado: ${new Date().toLocaleString('es')}   ·   Rango: ${this.rangoTexto()}`, 14, y);
      doc.setTextColor(0, 0, 0);
      y += 6;

      // KPIs
      autoTable(doc, {
        startY: y,
        head: [['Indicador', 'Valor']],
        body: [
          ['Total ejecuciones', String(this.totalInstancias)],
          ['Tasa de éxito', this.tasaExito],
          ['En curso ahora', String(this.activas)],
          ['Nodo más lento (prom.)', this.avgCuello],
          ['Proceso más lento (prom.)', this.procesoPlusLento],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 10 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // Gráficos (imágenes de los canvas)
      const graficos: { canvas?: HTMLCanvasElement; titulo: string }[] = [
        { canvas: this.canvasEstado?.nativeElement,    titulo: 'Estado de ejecuciones' },
        { canvas: this.canvasActividad?.nativeElement, titulo: 'Actividad' },
        { canvas: this.canvasCuello?.nativeElement,    titulo: 'Cuellos de botella' },
        { canvas: this.canvasProcesos?.nativeElement,  titulo: 'Procesos más lentos' },
        { canvas: this.canvasCarga?.nativeElement,     titulo: 'Carga por funcionario' },
      ];
      const imgW = (pageW - 14 * 2 - 8) / 2;
      const imgH = imgW * 0.62;
      let col = 0;
      let rowY = y;
      for (const g of graficos) {
        if (!g.canvas) continue;
        if (rowY + imgH + 8 > pageH - 10) { doc.addPage(); rowY = 16; col = 0; }
        const x = 14 + col * (imgW + 8);
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(g.titulo, x, rowY);
        const data = g.canvas.toDataURL('image/png', 1.0);
        doc.addImage(data, 'PNG', x, rowY + 2, imgW, imgH);
        col++;
        if (col === 2) { col = 0; rowY += imgH + 12; }
      }
      if (col === 1) rowY += imgH + 12;
      doc.setTextColor(0, 0, 0);

      // Tablas de detalle
      const addTabla = (titulo: string, head: string[], body: (string | number)[][]) => {
        if (!body.length) return;
        const startY = (rowY > pageH - 40) ? (doc.addPage(), 16) : rowY;
        doc.setFontSize(12);
        doc.text(titulo, 14, startY);
        autoTable(doc, {
          startY: startY + 2,
          head: [head],
          body,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 9 },
          margin: { left: 14, right: 14 },
        });
        rowY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      };

      addTabla('Cuellos de botella', ['Actividad', 'Tiempo prom.', 'Mediciones'],
        m.cuellosBottela.map(c => [c.nodoLabel, this.minLegible(c.avgMinutos), c.total]));
      addTabla('Procesos más lentos', ['Proceso', 'Duración prom.', 'Completados'],
        m.tiemposPorProceso.map(p => [p.procesoNombre, this.minLegible(p.avgMinutos), p.total]));
      addTabla('Carga por funcionario', ['Funcionario', 'Tareas pendientes'],
        m.cargaFuncionarios.map(c => [this.getNombreUsuario(c.userId), c.pendientes]));

      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`reporte-orquestia-${stamp}.pdf`);
    } finally {
      this.exportando.set(false);
    }
  }

  exportarExcel() {
    const m = this.metricas();
    if (!m) return;
    this.exportando.set(true);
    try {
      const wb = XLSX.utils.book_new();

      const resumen: (string | number)[][] = [
        ['Reporte de Procesos', this.nombreEmpresa() ?? 'Orquestia'],
        ['Generado', new Date().toLocaleString('es')],
        ['Rango', this.rangoTexto()],
        [],
        ['Indicador', 'Valor'],
        ['Total ejecuciones', this.totalInstancias],
        ['Tasa de éxito', this.tasaExito],
        ['En curso ahora', this.activas],
        ['Nodo más lento (prom.)', this.avgCuello],
        ['Proceso más lento (prom.)', this.procesoPlusLento],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');

      const estados: (string | number)[][] = [['Estado', 'Cantidad'],
        ...Object.entries(m.instanciasPorEstado)];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(estados), 'Estados');

      const cuellos: (string | number)[][] = [['Actividad', 'Tiempo prom. (min)', 'Mediciones'],
        ...m.cuellosBottela.map(c => [c.nodoLabel, c.avgMinutos, c.total])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cuellos), 'Cuellos de botella');

      const procesos: (string | number)[][] = [['Proceso', 'Duración prom. (min)', 'Completados'],
        ...m.tiemposPorProceso.map(p => [p.procesoNombre, p.avgMinutos, p.total])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(procesos), 'Procesos');

      const carga: (string | number)[][] = [['Funcionario', 'Tareas pendientes'],
        ...m.cargaFuncionarios.map(c => [this.getNombreUsuario(c.userId), c.pendientes])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(carga), 'Carga');

      const actividad: (string | number)[][] = [['Fecha', 'Ejecuciones iniciadas'],
        ...m.actividadReciente.map(a => [a.fecha, a.total])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actividad), 'Actividad');

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `reporte-orquestia-${stamp}.xlsx`);
    } finally {
      this.exportando.set(false);
    }
  }
}
