import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { TareaInstancia, Departamento, CampoFormulario } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-mis-tareas',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule, MatToolbarModule, DatePipe],
  templateUrl: './mis-tareas.html',
  styleUrl: './mis-tareas.scss'
})
export class MisTareas implements OnInit {

  tareas = signal<TareaInstancia[]>([]);
  departamentos = signal<Departamento[]>([]);
  departamento = signal<Departamento | null>(null);
  loading = signal(true);

  // La tarea que está abierta en el modal para completar
  tareaActiva = signal<TareaInstancia | null>(null);
  campos = signal<CampoFormulario[]>([]);
  respuestas: Record<string, unknown> = {};
  comentario = '';
  guardando = signal(false);

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private motor: MotorService,
    private router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.router.navigate(['/setup-empresa']); return; }

    // Por ahora: cargamos el primer departamento de la empresa
    // En una versión futura: el usuario tendrá un departamentoId asignado en su perfil
    this.api.getDepartamentos(empresaId).subscribe({
      next: (deptos) => {
        this.departamentos.set(deptos);
        if (deptos.length === 0) {
          this.loading.set(false);
          return;
        }
        const depto = deptos[0];
        this.departamento.set(depto);
        this.cargarTareas(depto.id);
      }
    });
  }

  onDepartamentoChange(deptoId: string) {
    const d = this.departamentos().find(x => x.id === deptoId);
    if (d) {
      this.departamento.set(d);
      this.cargarTareas(d.id);
    }
  }

  cargarTareas(departamentoId: string) {
    this.loading.set(true);
    this.motor.obtenerMisTareas(departamentoId).subscribe({
      next: (t) => { this.tareas.set(t); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  // Abre el modal con el formulario de la tarea
  abrirTarea(tarea: TareaInstancia) {
    this.tareaActiva.set(tarea);
    this.respuestas = {};
    this.comentario = '';

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

  cerrarModal() { this.tareaActiva.set(null); }

  completar() {
    const tarea = this.tareaActiva();
    if (!tarea) return;

    // Validar requeridos
    const incompleto = this.campos().some(c => c.requerido && !this.respuestas[c.nombre]);
    if (incompleto) return;

    this.guardando.set(true);
    this.motor.completarTarea(tarea.id, this.respuestas, this.comentario).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarModal();
        this.cargarTareas(this.departamento()!.id);
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

  getEstadoIcon(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'schedule',
      EN_PROGRESO: 'play_circle',
      COMPLETADA: 'check_circle',
      RECHAZADA: 'cancel'
    };
    return map[estado] ?? 'help';
  }

  logout() { this.auth.logout(); this.router.navigate(['/login']); }
  irDashboard() { this.router.navigate(['/dashboard']); }
}
