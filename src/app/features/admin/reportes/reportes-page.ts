import {
  Component, OnInit, OnDestroy, AfterViewInit,
  signal, ViewChild, ElementRef
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../shared/services/auth';
import { MetricaService } from '../../../shared/services/metrica';
import { ApiService } from '../../../shared/services/api';
import { MetricasEmpresa, UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'orq-reportes-page',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, TopNavbarComponent],
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

  private charts: Chart[] = [];
  private dataReady = false;
  private viewReady = false;

  constructor(
    public auth: AuthService,
    private metricaService: MetricaService,
    private apiService: ApiService,
    public router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.apiService.getFuncionarios(empresaId).subscribe({ next: f => { this.funcionarios = f; } });
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
}
