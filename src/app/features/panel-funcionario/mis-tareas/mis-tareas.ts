import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { ProcesoService } from '../../../shared/services/proceso';
import { TareaInstancia, Departamento, CampoFormulario, InstanciaProceso, Proceso } from '../../../shared/models/interfaces';
import { ProcessContextComponent } from '../../../shared/components/process-context/process-context.component';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'orq-mis-tareas',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatCardModule, DatePipe,
    ProcessContextComponent, TopNavbarComponent
  ],
  templateUrl: './mis-tareas.html',
  styleUrl: './mis-tareas.scss'
})
export class MisTareas implements OnInit {

  tareas = signal<TareaInstancia[]>([]);
  departamento = signal<Departamento | null>(null);
  procesosIniciables = signal<Proceso[]>([]);
  iniciando = signal<string | null>(null); // id del proceso que se está iniciando
  loading = signal(true);

  // Modal de tarea
  tareaActiva = signal<TareaInstancia | null>(null);
  campos = signal<CampoFormulario[]>([]);
  instanciaContexto = signal<Record<string, unknown>>({});
  campoLabels = signal<Record<string, string>>({});  // clave → etiqueta visible
  respuestas: Record<string, unknown> = {};
  comentario = '';
  guardando = signal(false);
  uploadEstados = signal<Record<string, 'idle' | 'uploading' | 'done' | 'error'>>({});

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private motor: MotorService,
    private procesoService: ProcesoService,
    private router: Router
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    if (!user?.empresaId) { this.router.navigate(['/setup-empresa']); return; }

    const deptoId = user.departamentoId;
    if (!deptoId) {
      // Admin sin departamento — puede ver todas las tareas de la empresa o ninguna
      this.loading.set(false);
      return;
    }

    // Cargar nombre del departamento para mostrar en el header
    this.api.getDepartamentos(user.empresaId).subscribe({
      next: (deptos) => {
        const depto = deptos.find(d => d.id === deptoId) ?? null;
        this.departamento.set(depto);
      }
    });

    this.cargarTareas();
    this.procesoService.listarIniciables(user.empresaId).subscribe({
      next: (p) => this.procesosIniciables.set(p)
    });
  }

  cargarTareas() {
    this.loading.set(true);
    this.motor.obtenerMisTareas().subscribe({
      next: (t) => { this.tareas.set(t); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  // Abre el modal con el formulario de la tarea + carga el contexto acumulado de la instancia
  abrirTarea(tarea: TareaInstancia) {
    this.tareaActiva.set(tarea);
    this.respuestas = {};
    this.comentario = '';
    this.instanciaContexto.set({});
    this.campoLabels.set({});

    // Cargar variables acumuladas + etiquetas de todas las tareas anteriores
    this.motor.obtenerInstancia(tarea.instanciaId).subscribe({
      next: (inst: InstanciaProceso) => this.instanciaContexto.set(inst.variables ?? {})
    });

    this.motor.obtenerTareasDeInstancia(tarea.instanciaId).subscribe({
      next: (tareas) => {
        const labels: Record<string, string> = {};
        tareas.forEach(t => (t.formularioCampos ?? []).forEach(c => { labels[c.nombre] = c.label; }));
        this.campoLabels.set(labels);
      }
    });

    // Usa el formulario embebido en la tarea (copiado del nodo por el motor).
    // Si el nodo no tenía formulario definido aún, mostramos el campo genérico "decision".
    const camposDefinidos = tarea.formularioCampos;
    this.campos.set(
      camposDefinidos && camposDefinidos.length > 0
        ? camposDefinidos
        : [{ nombre: 'decision', tipo: 'TEXTO', label: 'Resultado / decisión', requerido: true, opciones: [] }]
    );

    if (tarea.estado === 'PENDIENTE') {
      this.motor.iniciarTarea(tarea.id).subscribe({
        next: (t) => this.tareaActiva.set(t)
      });
    }
  }

  cerrarModal() {
    this.tareaActiva.set(null);
    this.uploadEstados.set({});
    this.campoLabels.set({});
  }

  subirArchivo(campoNombre: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'uploading' }));

    this.api.getPresignUrl(file.name, file.type).subscribe({
      next: ({ uploadUrl, publicUrl }) => {
        fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        }).then(res => {
          if (res.ok) {
            this.setRespuesta(campoNombre, publicUrl);
            this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'done' }));
          } else {
            this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }));
          }
        }).catch(() => {
          this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }));
        });
      },
      error: () => this.uploadEstados.update(e => ({ ...e, [campoNombre]: 'error' }))
    });
  }

  getUploadEstado(nombre: string): 'idle' | 'uploading' | 'done' | 'error' {
    return this.uploadEstados()[nombre] ?? 'idle';
  }

  completar() {
    const tarea = this.tareaActiva();
    if (!tarea) return;

    // Bloquear si hay archivos subiendo
    const haySubiendo = this.campos().some(c => c.tipo === 'ARCHIVO' && this.getUploadEstado(c.nombre) === 'uploading');
    if (haySubiendo) {
      alert('Espera a que todos los archivos terminen de subirse.');
      return;
    }

    // Validar requeridos (cuidado de no bloquear el valor booleano "false")
    const incompleto = this.campos().some(c => {
      if (!c.requerido) return false;
      const v = this.respuestas[c.nombre];
      return v === undefined || v === null || v === '';
    });
    if (incompleto) {
      alert('Por favor completa todos los campos requeridos.');
      return;
    }

    this.guardando.set(true);
    this.motor.completarTarea(tarea.id, this.respuestas, this.comentario).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarModal();
        this.cargarTareas();
      },
      error: () => this.guardando.set(false)
    });
  }

  getInputType(tipo: string): string {
    switch (tipo) {
      case 'NUMERO': return 'number';
      case 'FECHA':  return 'date';
      default:       return 'text';
    }
  }

  getRespuestaStr(campo: string): string {
    return (this.respuestas[campo] as string) ?? '';
  }

  setRespuesta(campo: string, value: unknown) {
    this.respuestas = { ...this.respuestas, [campo]: value };
  }

  // Devuelve el tipo visual de una variable del contexto para renderizarla correctamente
  tipoContexto(value: unknown): 'archivo' | 'bool' | 'texto' {
    if (typeof value === 'string' && value.startsWith('http')) return 'archivo';
    if (typeof value === 'boolean') return 'bool';
    return 'texto';
  }

  // Devuelve las claves del contexto que NO pertenecen al formulario actual
  get contextoPrevio(): [string, unknown][] {
    const camposActuales = new Set(this.campos().map(c => c.nombre));
    return Object.entries(this.instanciaContexto()).filter(([k]) => !camposActuales.has(k));
  }

  getEstadoIcon(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'schedule',
      EN_PROGRESO: 'play_circle',
      COMPLETADA: 'check_circle',
      RECHAZADA: 'cancel'
    };
    return map[estado] ?? 'help';
  }

  iniciarProceso(proceso: Proceso) {
    this.iniciando.set(proceso.id);
    this.motor.iniciarProceso(proceso.id).subscribe({
      next: () => {
        this.iniciando.set(null);
        this.cargarTareas();
      },
      error: () => this.iniciando.set(null)
    });
  }

  logout() { this.auth.logout(); this.router.navigate(['/login']); }
  irDashboard() {
    const rol = this.auth.user()?.rol;
    this.router.navigate([rol === 'FUNCIONARIO' ? '/mis-tareas' : '/dashboard']);
  }
}
