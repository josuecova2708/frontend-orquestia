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

  metricas   = signal<MetricasEmpresa | null>(null);
  cargando   = signal(true);
  error      = signal(false);
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

    this.apiService.getFuncionarios(empresaId).subscribe({
      next: (f) => { this.funcionarios = f; }
    });

    this.metricaService.getMetricas(empresaId).subscribe({
      next: (m) => {
        this.metricas.set(m);
        this.cargando.set(false);
        this.dataReady = true;
        if (this.viewReady) setTimeout(() => this.buildCharts(), 0);
      },
      error: () => {
        this.cargando.set(false);
        this.error.set(true);
      }
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    if (this.dataReady) setTimeout(() => this.buildCharts(), 0);
  }

  ngOnDestroy() {
    this.charts.forEach(c => c.destroy());
  }

  getNombreUsuario(userId: string): string {
    const f = this.funcionarios.find(u => u.id === userId);
    return f ? `${f.nombre} ${f.apellido}` : userId.slice(-6);
  }

  recargar() {
    this.cargando.set(true);
    this.error.set(false);
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    this.dataReady = false;
    this.viewReady = true; // view already initialized, only data is being refreshed
    this.ngOnInit();
  }

  private buildCharts() {
    const m = this.metricas()!;
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    // ── 1. Doughnut: Tasa de éxito ─────────────────────────────────────────
    const estadoLabels = Object.keys(m.instanciasPorEstado);
    const estadoData   = Object.values(m.instanciasPorEstado);
    const estadoColors: Record<string, string> = {
      COMPLETADA: '#22c55e',
      ACTIVA:     '#3b82f6',
      CANCELADA:  '#94a3b8',
      ERROR:      '#ef4444'
    };
    this.charts.push(new Chart(this.canvasEstado.nativeElement, {
      type: 'doughnut',
      data: {
        labels: estadoLabels,
        datasets: [{
          data: estadoData,
          backgroundColor: estadoLabels.map(l => estadoColors[l] ?? '#cbd5e1'),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        cutout: '65%',
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, font: { size: 11 } } }
        }
      }
    }));

    // ── 2. Horizontal bar: Cuello de botella (solo si hay canvas en el DOM) ──
    if (this.canvasCuello?.nativeElement) {
      const cuelloLabels = m.cuellosBottela.map(c => c.nodoLabel);
      const cuelloData   = m.cuellosBottela.map(c => c.avgMinutos);
      this.charts.push(new Chart(this.canvasCuello.nativeElement, {
        type: 'bar',
        data: {
          labels: cuelloLabels,
          datasets: [{
            label: 'Tiempo promedio (min)',
            data: cuelloData,
            backgroundColor: '#f59e0b',
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
            y: { grid: { display: false }, ticks: { font: { size: 11 } } }
          }
        }
      }));
    }

    // ── 3. Vertical bar: Carga actual (solo si hay canvas en el DOM) ──────
    if (this.canvasCarga?.nativeElement) {
      const cargaLabels = m.cargaFuncionarios.map(c => this.getNombreUsuario(c.userId));
      const cargaData   = m.cargaFuncionarios.map(c => c.pendientes);
      this.charts.push(new Chart(this.canvasCarga.nativeElement, {
        type: 'bar',
        data: {
          labels: cargaLabels,
          datasets: [{
            label: 'Tareas pendientes',
            data: cargaData,
            backgroundColor: '#3b82f6',
            borderRadius: 4
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
            x: { grid: { display: false }, ticks: { font: { size: 11 } } }
          }
        }
      }));
    }

    // ── 4. Line: Actividad reciente (30 días) ──────────────────────────────
    const actLabels = m.actividadReciente.map(a => {
      const [, mm, dd] = a.fecha.split('-');
      return `${dd}/${mm}`;
    });
    const actData = m.actividadReciente.map(a => a.total);
    this.charts.push(new Chart(this.canvasActividad.nativeElement, {
      type: 'line',
      data: {
        labels: actLabels,
        datasets: [{
          label: 'Ejecuciones iniciadas',
          data: actData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } }
        }
      }
    }));
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

  get activas(): number {
    return this.metricas()?.instanciasPorEstado['ACTIVA'] ?? 0;
  }

  get avgCuello(): string {
    const m = this.metricas();
    if (!m || m.cuellosBottela.length === 0) return '—';
    const avg = m.cuellosBottela.reduce((s, c) => s + c.avgMinutos, 0) / m.cuellosBottela.length;
    if (avg < 60) return avg.toFixed(0) + ' min';
    return (avg / 60).toFixed(1) + ' h';
  }
}
