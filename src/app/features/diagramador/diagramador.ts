import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { ProcesoService } from '../../shared/services/proceso';
import { ApiService } from '../../shared/services/api';
import { AuthService } from '../../shared/services/auth';
import { Proceso, Nodo, Conexion, Departamento, CampoFormulario } from '../../shared/models/interfaces';
import { DecimalPipe } from '@angular/common';
import { NodoComponent } from './components/nodo/nodo.component';
import { FlechaComponent } from './components/flecha/flecha.component';

@Component({
  selector: 'orq-diagramador',
  standalone: true,
  imports: [
    FormsModule, MatToolbarModule, MatButtonModule, MatIconModule,
    MatSidenavModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSnackBarModule, MatMenuModule, DecimalPipe, NodoComponent, FlechaComponent
  ],
  templateUrl: './diagramador.html',
  styleUrl: './diagramador.scss'
})
export class Diagramador implements OnInit {
  proceso = signal<Proceso | null>(null);
  nodos = signal<Nodo[]>([]);
  conexiones = signal<Conexion[]>([]);
  departamentosEmpresa = signal<Departamento[]>([]);
  departamentosCanvas = signal<Departamento[]>([]);

  // Estado del UI
  selectedItem = signal<{ type: 'NODO' | 'CONEXION' | null, id: string | null }>({ type: null, id: null });
  zoom = signal(1);

  // Drag & Drop Nodes
  draggedNodeType = signal<string | null>(null);
  
  // Moving Nodes
  movingNodeId = signal<string | null>(null);
  offset = { x: 0, y: 0 };

  // Drawing Connections
  drawingConnection = signal<{ origenId: string, startX: number, startY: number, currentX: number, currentY: number } | null>(null);

  protected Math = Math; // Expose to template

  // Paleta de nodos permitidos
  nodeTypes = [
    { type: 'INICIO',       label: 'Inicio',        icon: 'play_circle',   desc: 'Punto de entrada del proceso' },
    { type: 'ACTIVIDAD',    label: 'Tarea',          icon: 'task',          desc: 'Trabajo que realiza un departamento' },
    { type: 'GATEWAY_XOR', label: 'Decisión',       icon: 'call_split',    desc: 'Bifurcación: solo UN camino se toma' },
    { type: 'GATEWAY_AND', label: 'Paralelo',       icon: 'linear_scale',  desc: 'Divide en tareas simultáneas o espera que todas terminen' },
    { type: 'FIN',          label: 'Fin',            icon: 'stop_circle',   desc: 'Punto de cierre del proceso' },
  ];

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    public auth: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.cargarProceso(id);
    }
  }

  cargarProceso(id: string) {
    this.procesoService.obtener(id).subscribe({
      next: (p) => {
        this.proceso.set(p);
        this.nodos.set(p.nodos || []);
        this.conexiones.set(p.conexiones || []);
        this.cargarDepartamentos(p.empresaId);
      },
      error: () => this.router.navigate(['/dashboard'])
    });
  }

  cargarDepartamentos(empresaId: string) {
    this.apiService.getDepartamentos(empresaId).subscribe({
      next: (depts) => {
        this.departamentosEmpresa.set(depts);
        this.computarLanesVisibles();
      }
    });
  }

  computarLanesVisibles() {
    const todos = this.departamentosEmpresa();
    if (todos.length === 0) return;

    // Extraer IDs que ya se están usando en los nodos
    const usados = new Set(this.nodos().map(n => n.departamentoId).filter(id => !!id));

    // Agregar a los visibles los departamentos que tienen nodos
    const activos = todos.filter(d => usados.has(d.id));

    // Si es un lienzo en blanco o ninguno aplicó, agregamos el primer departamento por defecto para no dejarlo vacío
    if (activos.length === 0) {
      activos.push(todos[0]);
    }

    this.departamentosCanvas.set(activos);
  }

  agregarLaneCanvas(depto: Departamento) {
    // Si ya está, no hacer nada
    if (this.departamentosCanvas().some(d => d.id === depto.id)) return;
    this.departamentosCanvas.update(l => [...l, depto]);
  }

  getDepartamentosNoUsados() {
    return this.departamentosEmpresa().filter(d => !this.departamentosCanvas().some(c => c.id === d.id));
  }

  // Estado para el mini-formulario de crear departamento dentro del diagramador
  showNewDepto = signal(false);
  newDeptoNombre = '';

  // ── FORM BUILDER ──────────────────────────────────────────────────────────
  // null = oculto, 'new' = añadiendo, number = editando índice
  editingCampoIndex = signal<number | 'new' | null>(null);

  // Objeto mutable que ngModel va a bindear directamente (sin signals)
  campoForm: { nombre: string; tipo: CampoFormulario['tipo']; label: string; requerido: boolean; opcionesTexto: string } = {
    nombre: '', tipo: 'TEXTO', label: '', requerido: false, opcionesTexto: ''
  };

  get camposActuales(): CampoFormulario[] {
    return this.selectedNode?.formulario ?? [];
  }

  abrirNuevoCampo() {
    this.campoForm = { nombre: '', tipo: 'TEXTO', label: '', requerido: false, opcionesTexto: '' };
    this.editingCampoIndex.set('new');
  }

  abrirEditarCampo(i: number) {
    const c = this.camposActuales[i];
    this.campoForm = {
      nombre: c.nombre,
      tipo: c.tipo,
      label: c.label,
      requerido: c.requerido,
      opcionesTexto: c.opciones?.join(', ') ?? ''
    };
    this.editingCampoIndex.set(i);
  }

  guardarCampo() {
    const idx = this.editingCampoIndex();
    if (idx === null || !this.campoForm.nombre.trim() || !this.campoForm.label.trim()) return;

    const campo: CampoFormulario = {
      nombre: this.campoForm.nombre.trim().toLowerCase().replace(/\s+/g, '_'),
      tipo: this.campoForm.tipo,
      label: this.campoForm.label.trim(),
      requerido: this.campoForm.requerido,
      opciones: this.campoForm.tipo === 'OPCIONES'
        ? this.campoForm.opcionesTexto.split(',').map(s => s.trim()).filter(Boolean)
        : []
    };

    const campos = [...this.camposActuales];
    if (idx === 'new') {
      campos.push(campo);
    } else {
      campos[idx] = campo;
    }

    this.updateSelectedNode({ formulario: campos });
    this.editingCampoIndex.set(null);
  }

  eliminarCampo(i: number) {
    const campos = this.camposActuales.filter((_, idx) => idx !== i);
    this.updateSelectedNode({ formulario: campos });
    if (this.editingCampoIndex() === i) this.editingCampoIndex.set(null);
  }

  cancelarCampo() {
    this.editingCampoIndex.set(null);
  }
  // ──────────────────────────────────────────────────────────────────────────

  crearDepartamentoInline() {
    const empresaId = this.proceso()?.empresaId;
    if (!empresaId || !this.newDeptoNombre.trim()) return;
    this.apiService.crearDepartamento(empresaId, {
      nombre: this.newDeptoNombre.trim(),
      descripcion: ''
    }).subscribe({
      next: (d) => {
        this.departamentosEmpresa.update(list => [...list, d]);
        this.agregarLaneCanvas(d); // Asegurar que el nuevo depto se agregue al canvas
        this.newDeptoNombre = '';
        this.showNewDepto.set(false);
        // Asignar el nuevo departamento al nodo seleccionado si es ACTIVIDAD
        const nodo = this.selectedNode;
        if (nodo?.tipo === 'ACTIVIDAD') {
          this.updateSelectedNode({ departamentoId: d.id });
        }
      }
    });
  }


  // === PALETA DRAG & DROP ===

  onDragStart(event: DragEvent, type: string) {
    event.dataTransfer?.setData('text/plain', type);
    this.draggedNodeType.set(type);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault(); // Permite el drop
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer?.getData('text/plain') as Nodo['tipo'];
    if (!type) return;

    // Calcular posición real restando offsets del contenedor
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / this.zoom();
    const y = (event.clientY - rect.top) / this.zoom();

    // Auto-numerado inteligente por tipo
    const nt = this.nodeTypes.find(n => n.type === type);
    const baseLabel = nt?.label || 'Nuevo';
    const countSameType = this.nodos().filter(n => n.tipo === type).length;
    const autoLabel = (type === 'INICIO' || type === 'FIN') 
      ? baseLabel 
      : `${baseLabel} ${countSameType + 1}`;

    const nuevoNodo: Nodo = {
      id: 'node_' + Math.random().toString(36).substr(2, 9),
      tipo: type,
      label: autoLabel,
      posX: Math.round(x),
      posY: Math.round(y)
    };

    // Asignación automática por carril
    const laneIndex = Math.floor(x / 400);
    const depts = this.departamentosCanvas();
    if (type === 'ACTIVIDAD' && depts[laneIndex]) {
      nuevoNodo.departamentoId = depts[laneIndex].id;
    } else if (type === 'ACTIVIDAD') {
      nuevoNodo.departamentoId = depts[0]?.id;
    }

    this.nodos.update(ns => [...ns, nuevoNodo]);
    this.seleccionarNodo(nuevoNodo.id);
    this.draggedNodeType.set(null);
  }

  // === MOVER NODOS ===

  startNodeMove(event: MouseEvent | TouchEvent, nodeId: string) {
    // Evitar disparar esto si tocamos el puerto de conexión
    if ((event.target as HTMLElement).classList.contains('port')) return;
    
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }

    const node = this.nodos().find(n => n.id === nodeId);
    if (!node) return;

    this.movingNodeId.set(nodeId);
    this.seleccionarNodo(nodeId);
    
    this.offset = {
      x: clientX / this.zoom() - node.posX,
      y: clientY / this.zoom() - node.posY
    };
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onMouseMove(event: MouseEvent | TouchEvent) {
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }

    // Mover Nodo
    const movingId = this.movingNodeId();
    if (movingId) {
      this.nodos.update(ns => ns.map(n => {
        if (n.id === movingId) {
          return {
            ...n,
            posX: Math.round(clientX / this.zoom() - this.offset.x),
            posY: Math.round(clientY / this.zoom() - this.offset.y)
          };
        }
        return n;
      }));
    }

    // Dibujar Flecha Temporal
    const drawing = this.drawingConnection();
    if (drawing) {
      const wrapper = document.querySelector('.canvas-container')?.getBoundingClientRect();
      if (wrapper) {
        this.drawingConnection.update(d => {
          if (!d) return null;
          return {
            ...d,
            currentX: (clientX - wrapper.left) / this.zoom(),
            currentY: (clientY - wrapper.top) / this.zoom()
          };
        });
      }
    }
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onMouseUp() {
    const movingId = this.movingNodeId();
    if (movingId) {
       const node = this.nodos().find(n => n.id === movingId);
       if (node && node.tipo === 'ACTIVIDAD') {
          this.autoAssignDepartment(node.id, node.posX);
       }
    }
    
    this.movingNodeId.set(null);
    this.drawingConnection.set(null); // Si soltamos en el vacío, cancelar
  }

  // === CONECTAR NODOS ===

  startConnection(event: MouseEvent | TouchEvent, origenId: string) {
    event.stopPropagation();
    event.preventDefault(); // Previene scroll en móvil o selecciones raras
    
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }

    const wrapper = document.querySelector('.canvas-container')?.getBoundingClientRect();
    if (wrapper) {
      const x = (clientX - wrapper.left) / this.zoom();
      const y = (clientY - wrapper.top) / this.zoom();
      this.drawingConnection.set({ origenId, startX: x, startY: y, currentX: x, currentY: y });
    }
  }

  finishConnection(destinoId: string) {
    const drawing = this.drawingConnection();
    if (drawing && drawing.origenId !== destinoId) {
      // Prevenir duplicados (A -> B ya existe)
      const existe = this.conexiones().find(c => c.origenId === drawing.origenId && c.destinoId === destinoId);
      if (!existe) {
        const nueva: Conexion = {
          id: 'conn_' + Math.random().toString(36).substr(2, 9),
          origenId: drawing.origenId,
          destinoId: destinoId,
          tipo: 'NORMAL',
          esDefault: false
        };
        this.conexiones.update(cs => [...cs, nueva]);
        this.seleccionarConexion(nueva.id);
      }
    }
    this.drawingConnection.set(null);
  }

  // === SELECCIÓN Y PROPIEDADES ===

  seleccionarNodo(id: string) {
    this.selectedItem.set({ type: 'NODO', id });
  }

  seleccionarConexion(id: string) {
    this.selectedItem.set({ type: 'CONEXION', id });
  }

  unselect() {
    this.selectedItem.set({ type: null, id: null });
  }

  getNode(id: string): Nodo | undefined {
    return this.nodos().find(n => n.id === id);
  }

  get selectedNode(): Nodo | undefined {
    return this.nodos().find(n => n.id === this.selectedItem().id);
  }

  get selectedConexion(): Conexion | undefined {
    return this.conexiones().find(c => c.id === this.selectedItem().id);
  }

  updateSelectedNode(data: Partial<Nodo>) {
    const id = this.selectedItem().id;
    
    // Si el usuario cambia el departamento desde el panel de propiedades,
    // movemos mágicamente el nodo al carril correspondiente
    if (data.departamentoId) {
      const node = this.nodos().find(x => x.id === id);
      if (node && node.departamentoId !== data.departamentoId) {
         const newIndex = this.departamentosCanvas().findIndex((d: Departamento) => d.id === data.departamentoId);
         if (newIndex >= 0) {
            data.posX = (newIndex * 400) + 110; // Centrar en el carril (400 width)
         }
      }
    }

    this.nodos.update(ns => ns.map(n => n.id === id ? { ...n, ...data } : n));
  }

  // Helper para asignar departamento según carril si se arrastra
  autoAssignDepartment(nodeId: string, x: number) {
    const laneIndex = Math.floor(x / 400);
    const depts = this.departamentosCanvas();
    if (depts[laneIndex]) {
      this.nodos.update(ns => ns.map(n => n.id === nodeId ? { ...n, departamentoId: depts[laneIndex].id } : n));
    }
  }

  updateSelectedConexion(data: Partial<Conexion>) {
    const id = this.selectedItem().id;
    this.conexiones.update(cs => cs.map(c => c.id === id ? { ...c, ...data } : c));
  }

  // Devuelve los campos de los nodos ACTIVIDAD que alimentan la conexión seleccionada.
  // Si el origen es un GATEWAY, sube un nivel para encontrar el ACTIVIDAD upstream.
  get variablesDisponibles(): CampoFormulario[] {
    const conn = this.selectedConexion;
    if (!conn) return [];

    const sourceNode = this.getNode(conn.origenId);
    if (!sourceNode) return [];

    if (sourceNode.tipo === 'ACTIVIDAD') {
      return sourceNode.formulario ?? [];
    }

    if (sourceNode.tipo === 'GATEWAY_XOR' || sourceNode.tipo === 'GATEWAY_AND') {
      const campos: CampoFormulario[] = [];
      this.conexiones()
        .filter(c => c.destinoId === sourceNode.id)
        .forEach(ic => {
          const upstream = this.getNode(ic.origenId);
          if (upstream?.tipo === 'ACTIVIDAD') {
            (upstream.formulario ?? []).forEach(c => {
              if (!campos.some(e => e.nombre === c.nombre)) campos.push(c);
            });
          }
        });
      return campos;
    }

    return [];
  }

  insertarCondicion(expr: string) {
    this.updateSelectedConexion({ condicion: expr });
  }

  eliminarNodo(id: string) {
    this.nodos.update(ns => ns.filter(n => n.id !== id));
    this.conexiones.update(cs => cs.filter(c => c.origenId !== id && c.destinoId !== id));
    if (this.selectedItem().id === id) this.unselect();
  }

  eliminarConexion(id: string) {
    this.conexiones.update(cs => cs.filter(c => c.id !== id));
    if (this.selectedItem().id === id) this.unselect();
  }

  // === UTILIDADES DE DIBUJO ===

  getNodePort(id: string, type: 'top' | 'bottom') {
    const n = this.nodos().find(x => x.id === id);
    if (!n) return { x: 0, y: 0 };
    
    // Ancho/Alto promedio según el SCSS que hicimos en el componente nodo:
    let w = 176; // ACTIVIDAD (140 min-width + 32 padding)
    let h = 60;  // ACTIVIDAD aprox
    if (n.tipo === 'INICIO' || n.tipo === 'FIN') {
      w = 60; h = 60;
    } else if (n.tipo === 'GATEWAY_XOR') {
      w = 100; h = 100;
    } else if (n.tipo === 'GATEWAY_AND') {
      w = 180; h = 24;
    }

    if (type === 'top') {
       return { x: n.posX + (w/2), y: n.posY };
    } else {
       return { x: n.posX + (w/2), y: n.posY + h };
    }
  }

  // === ACCIONES DE DIAGRAMA ===

  guardarBorrador() {
    const p = this.proceso();
    if (!p) return;
    this.procesoService.guardar(p.id, {
      nombre: p.nombre,
      descripcion: p.descripcion,
      empresaId: p.empresaId,
      nodos: this.nodos(),
      conexiones: this.conexiones()
    }).subscribe({
      next: () => {
        this.snackBar.open('Diagrama guardado', 'OK', { duration: 3000 });
      }
    });
  }

  validarDiagrama(): string | null {
    const nodos = this.nodos();
    const conexiones = this.conexiones();

    if (!nodos.some(n => n.tipo === 'INICIO')) return '⛔ Falta un nodo de Inicio.';
    if (!nodos.some(n => n.tipo === 'FIN')) return '⛔ Falta un nodo de Fin.';

    const inicios = nodos.filter(n => n.tipo === 'INICIO');
    for (const inicio of inicios) {
      if (!conexiones.some(c => c.origenId === inicio.id)) {
        return `⛔ El nodo Inicio no tiene ninguna conexión saliente.`;
      }
    }

    const actividades = nodos.filter(n => n.tipo === 'ACTIVIDAD');
    const sinDepto = actividades.filter(n => !n.departamentoId);
    if (sinDepto.length > 0) {
      return `⚠️ ${sinDepto.length} tarea(s) sin departamento: ${sinDepto.map(n => n.label).join(', ')}. Asigna un departamento a cada tarea.`;
    }

    const xors = nodos.filter(n => n.tipo === 'GATEWAY_XOR');
    for (const xor of xors) {
      const salientes = conexiones.filter(c => c.origenId === xor.id);
      if (salientes.length < 2) {
        return `⛔ La Decisión "${xor.label}" debe tener al menos 2 flechas salientes.`;
      }
    }

    const ands = nodos.filter(n => n.tipo === 'GATEWAY_AND');
    for (const and of ands) {
      const salientes = conexiones.filter(c => c.origenId === and.id);
      const entrantes = conexiones.filter(c => c.destinoId === and.id);
      if (salientes.length < 2 && entrantes.length < 2) {
        return `⛔ El Paralelo "${and.label}" necesita múltiples flechas entrantes o salientes.`;
      }
    }

    return null; // Todo OK
  }

  publicar() {
    const p = this.proceso();
    if (!p) return;

    const error = this.validarDiagrama();
    if (error) {
      this.snackBar.open(error, 'Cerrar', { duration: 6000, panelClass: 'snack-warn' });
      return;
    }
    
    // Auto-save antes de publicar
    this.procesoService.guardar(p.id, {
      nombre: p.nombre, descripcion: p.descripcion, empresaId: p.empresaId,
      nodos: this.nodos(), conexiones: this.conexiones()
    }).subscribe({
      next: () => {
        this.procesoService.publicar(p.id).subscribe({
          next: () => {
            this.snackBar.open('¡Proceso Publicado!', 'OK', { duration: 3000 });
            this.router.navigate(['/dashboard']);
          },
          error: (err) => {
            this.snackBar.open(err.error?.error || 'Error al publicar', 'Cerrar', { duration: 5000 });
          }
        });
      }
    });
  }
}
