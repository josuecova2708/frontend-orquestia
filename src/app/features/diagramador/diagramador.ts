import { Component, OnInit, OnDestroy, signal, computed, HostListener } from '@angular/core';
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
import { Subject, Subscription, firstValueFrom } from 'rxjs';
import { throttleTime, debounceTime, asyncScheduler } from 'rxjs';
import { ProcesoService } from '../../shared/services/proceso';
import { ApiService } from '../../shared/services/api';
import { AuthService } from '../../shared/services/auth';
import { WebSocketService, DiagramaEvent } from '../../shared/services/websocket.service';
import { IaService, DiagramaIaResponse } from '../../shared/services/ia.service';
import { Proceso, Nodo, Conexion, Departamento, CampoFormulario } from '../../shared/models/interfaces';
import { DecimalPipe } from '@angular/common';
import { NodoComponent } from './components/nodo/nodo.component';
import { FlechaComponent } from './components/flecha/flecha.component';

const CURSOR_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

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
export class Diagramador implements OnInit, OnDestroy {
  proceso = signal<Proceso | null>(null);
  nodos = signal<Nodo[]>([]);
  conexiones = signal<Conexion[]>([]);
  departamentosEmpresa = signal<Departamento[]>([]);
  departamentosCanvas = signal<Departamento[]>([]);

  selectedItem = signal<{ type: 'NODO' | 'CONEXION' | null, id: string | null }>({ type: null, id: null });
  zoom = signal(1);
  draggedNodeType = signal<string | null>(null);
  movingNodeId = signal<string | null>(null);
  offset = { x: 0, y: 0 };
  drawingConnection = signal<{ origenId: string, startX: number, startY: number, currentX: number, currentY: number } | null>(null);

  // ── Colaboración ────────────────────────────────────────────────────────────
  remoteCursors = signal<Record<string, { x: number; y: number; name: string; color: string }>>({});
  remoteCursorsArray = computed(() =>
    Object.entries(this.remoteCursors()).map(([userId, c]) => ({ userId, ...c }))
  );
  private procesoId = '';
  private myUserId = '';
  private wsSub: Subscription | null = null;

  // Subjects para throttle/debounce
  private nodeMoveSubject   = new Subject<{ nodeId: string; x: number; y: number }>();
  private nodeUpdateSubject = new Subject<Nodo>();          // propiedades: debounce 400ms
  private autoSaveSubject   = new Subject<void>();          // auto-guardado: debounce 1.5s
  private cursorSubject     = new Subject<{ x: number; y: number }>();
  private cursorTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};
  private colorIndex = 0;
  private userColors: Record<string, string> = {};
  // ───────────────────────────────────────────────────────────────────────────

  protected Math = Math;

  nodeTypes = [
    { type: 'INICIO',       label: 'Inicio',    icon: 'play_circle',  desc: 'Punto de entrada del proceso' },
    { type: 'ACTIVIDAD',    label: 'Tarea',     icon: 'task',         desc: 'Trabajo que realiza un departamento' },
    { type: 'GATEWAY_XOR', label: 'Decisión',  icon: 'call_split',   desc: 'Bifurcación: solo UN camino se toma' },
    { type: 'GATEWAY_AND', label: 'Paralelo',  icon: 'linear_scale', desc: 'Divide en tareas simultáneas o espera que todas terminen' },
    { type: 'FIN',          label: 'Fin',       icon: 'stop_circle',  desc: 'Punto de cierre del proceso' },
  ];

  // ── IA Modal ────────────────────────────────────────────────────────────────
  iaModalVisible  = signal(false);
  iaFase          = signal<'input' | 'confirmar'>('input');
  iaDescripcion   = '';
  iaGenerando     = signal(false);
  iaError         = signal('');
  iaDeptsNuevos: string[] = [];
  private iaResultadoPendiente: DiagramaIaResponse | null = null;
  // ───────────────────────────────────────────────────────────────────────────

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private procesoService: ProcesoService,
    private apiService: ApiService,
    public auth: AuthService,
    private snackBar: MatSnackBar,
    private wsService: WebSocketService,
    private iaService: IaService
  ) {}

  ngOnInit() {
    if (!this.auth.isLoggedIn()) { this.router.navigate(['/login']); return; }
    this.myUserId = this.auth.user()?.userId ?? '';
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.procesoId = id;
      this.cargarProceso(id);
      this.conectarWebSocket(id);
    }
  }

  ngOnDestroy() {
    this.wsService.desconectar();
    this.wsSub?.unsubscribe();
    [this.nodeMoveSubject, this.nodeUpdateSubject, this.autoSaveSubject, this.cursorSubject]
      .forEach(s => s.complete());
    Object.values(this.cursorTimeouts).forEach(t => clearTimeout(t));
  }

  // ── WebSocket ───────────────────────────────────────────────────────────────

  private conectarWebSocket(procesoId: string) {
    // Posición durante drag — throttle 50ms
    this.nodeMoveSubject.pipe(
      throttleTime(50, asyncScheduler, { leading: true, trailing: true })
    ).subscribe(({ nodeId, x, y }) => {
      this.wsService.publicar(procesoId, { tipo: 'NODE_MOVED', data: { id: nodeId, posX: x, posY: y } });
    });

    // Propiedades del nodo — debounce 400ms (espera que el usuario pare de escribir)
    this.nodeUpdateSubject.pipe(debounceTime(400)).subscribe(nodo => {
      this.wsService.publicar(procesoId, { tipo: 'NODE_UPDATED', data: { nodo } });
    });

    // Auto-guardado silencioso — debounce 1.5s tras cualquier cambio de propiedad
    this.autoSaveSubject.pipe(debounceTime(1500)).subscribe(() => this.autoGuardar());

    // Cursor — throttle 80ms
    this.cursorSubject.pipe(
      throttleTime(80, asyncScheduler, { leading: true, trailing: true })
    ).subscribe(({ x, y }) => {
      this.wsService.publicar(procesoId, { tipo: 'CURSOR_MOVED', data: { x, y } });
    });

    this.wsSub = this.wsService.conectar(procesoId, this.auth.token()).subscribe(event => {
      this.aplicarEvento(event);
    });
  }

  private aplicarEvento(event: DiagramaEvent) {
    if (event.userId === this.myUserId) return;

    switch (event.tipo) {

      case 'NODE_MOVED':
        this.nodos.update(ns => ns.map(n =>
          n.id === event.data['id']
            ? { ...n, posX: event.data['posX'] as number, posY: event.data['posY'] as number }
            : n
        ));
        break;

      case 'NODE_ADDED': {
        const nodo = event.data['nodo'] as Nodo;
        if (nodo && !this.nodos().some(n => n.id === nodo.id)) {
          this.nodos.update(ns => [...ns, nodo]);
        }
        break;
      }

      case 'NODE_DELETED': {
        const id = event.data['id'] as string;
        this.nodos.update(ns => ns.filter(n => n.id !== id));
        this.conexiones.update(cs => cs.filter(c => c.origenId !== id && c.destinoId !== id));
        break;
      }

      // Reemplaza el nodo completo con los datos recibidos (label, dept, formulario, posX, etc.)
      case 'NODE_UPDATED': {
        const nodo = event.data['nodo'] as Nodo;
        if (nodo) {
          this.nodos.update(ns => ns.map(n => n.id === nodo.id ? { ...nodo } : n));
        }
        break;
      }

      case 'CONEXION_ADDED': {
        const conn = event.data['conexion'] as Conexion;
        if (conn && !this.conexiones().some(c => c.id === conn.id)) {
          this.conexiones.update(cs => [...cs, conn]);
        }
        break;
      }

      case 'CONEXION_DELETED':
        this.conexiones.update(cs => cs.filter(c => c.id !== event.data['id']));
        break;

      case 'CONEXION_UPDATED': {
        const conn = event.data['conexion'] as Conexion;
        if (conn) this.conexiones.update(cs => cs.map(c => c.id === conn.id ? { ...conn } : c));
        break;
      }

      // Sincroniza lanes + departamentos nuevos + nodos afectados por cambio de carril
      case 'LANES_UPDATED': {
        const lanes    = event.data['lanes']    as Departamento[];
        const allDepts = event.data['allDepts'] as Departamento[];
        const nodosWs  = event.data['nodos']    as Nodo[] | undefined;
        allDepts?.forEach(d => {
          if (!this.departamentosEmpresa().some(e => e.id === d.id)) {
            this.departamentosEmpresa.update(list => [...list, d]);
          }
        });
        this.departamentosCanvas.set(lanes ?? []);
        // Actualizar departamentoId de nodos afectados (cambio o eliminación de carril)
        if (nodosWs?.length) {
          nodosWs.forEach(nu => {
            this.nodos.update(ns => ns.map(n =>
              n.id === nu.id ? { ...n, departamentoId: nu.departamentoId } : n
            ));
          });
        }
        break;
      }

      case 'DIAGRAM_RESET': {
        const nodos     = event.data['nodos']     as Nodo[];
        const conexiones = event.data['conexiones'] as Conexion[];
        this.nodos.set(nodos ?? []);
        this.conexiones.set(conexiones ?? []);
        this.departamentosCanvas.set([]);
        this.selectedItem.set({ type: null, id: null });
        this.computarLanesVisibles();
        break;
      }

      case 'CURSOR_MOVED': {
        if (!this.userColors[event.userId]) {
          this.userColors[event.userId] = CURSOR_COLORS[this.colorIndex++ % CURSOR_COLORS.length];
        }
        this.remoteCursors.update(c => ({
          ...c,
          [event.userId]: {
            x: event.data['x'] as number,
            y: event.data['y'] as number,
            name: event.userName,
            color: this.userColors[event.userId]
          }
        }));
        if (this.cursorTimeouts[event.userId]) clearTimeout(this.cursorTimeouts[event.userId]);
        this.cursorTimeouts[event.userId] = setTimeout(() => {
          this.remoteCursors.update(c => { const nc = { ...c }; delete nc[event.userId]; return nc; });
        }, 4000);
        break;
      }
    }
  }

  // Auto-guardado silencioso (sin snackbar) para mantener el DB al día
  private autoGuardar() {
    const p = this.proceso();
    if (!p || p.estado !== 'BORRADOR') return;
    this.procesoService.guardar(p.id, {
      nombre: p.nombre, descripcion: p.descripcion, empresaId: p.empresaId,
      nodos: this.nodos(), conexiones: this.conexiones()
    }).subscribe();
  }

  // Emite LANES_UPDATED con los datos completos de departamentos y nodos afectados
  private emitirLanesActualizados(nodosAfectados?: Nodo[]) {
    this.wsService.publicar(this.procesoId, {
      tipo: 'LANES_UPDATED',
      data: {
        lanes:    this.departamentosCanvas(),
        allDepts: this.departamentosEmpresa(),
        ...(nodosAfectados?.length ? { nodos: nodosAfectados } : {})
      }
    });
    this.autoGuardar();
  }

  // ── Carga ───────────────────────────────────────────────────────────────────

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
      next: (depts) => { this.departamentosEmpresa.set(depts); this.computarLanesVisibles(); }
    });
  }

  computarLanesVisibles() {
    const todos = this.departamentosEmpresa();
    if (todos.length === 0) return;
    const usados = new Set(this.nodos().map(n => n.departamentoId).filter(id => !!id));
    this.departamentosCanvas.set(todos.filter(d => usados.has(d.id)));
  }

  agregarLaneCanvas(depto: Departamento) {
    if (this.departamentosCanvas().some(d => d.id === depto.id)) return;
    this.departamentosCanvas.update(l => [...l, depto]);
    this.emitirLanesActualizados();
  }

  cambiarLaneCanvas(index: number, nuevoDepto: Departamento) {
    const oldDepto = this.departamentosCanvas()[index];
    const afectadosIds = this.nodos().filter(n => n.departamentoId === oldDepto.id).map(n => n.id);
    this.departamentosCanvas.update(lanes => {
      const nl = [...lanes]; nl[index] = nuevoDepto; return nl;
    });
    this.nodos.update(ns => ns.map(n =>
      n.departamentoId === oldDepto.id ? { ...n, departamentoId: nuevoDepto.id } : n
    ));
    if (this.selectedItem().type === 'NODO') this.selectedItem.set({ ...this.selectedItem() });
    const afectados = this.nodos().filter(n => afectadosIds.includes(n.id));
    this.emitirLanesActualizados(afectados);
  }

  removerLaneCanvas(index: number) {
    const oldDepto = this.departamentosCanvas()[index];
    const afectadosIds = this.nodos().filter(n => n.departamentoId === oldDepto.id).map(n => n.id);
    this.departamentosCanvas.update(lanes => lanes.filter((_, i) => i !== index));
    this.nodos.update(ns => ns.map(n =>
      n.departamentoId === oldDepto.id ? { ...n, departamentoId: undefined } : n
    ));
    const afectados = this.nodos().filter(n => afectadosIds.includes(n.id));
    this.emitirLanesActualizados(afectados);
  }

  getDepartamentosNoUsados() {
    return this.departamentosEmpresa().filter(d => !this.departamentosCanvas().some(c => c.id === d.id));
  }

  showNewDepto = signal(false);
  newDeptoNombre = '';

  // ── Form Builder ────────────────────────────────────────────────────────────

  editingCampoIndex = signal<number | 'new' | null>(null);
  campoForm: { nombre: string; tipo: CampoFormulario['tipo']; label: string; requerido: boolean; opcionesTexto: string } = {
    nombre: '', tipo: 'TEXTO', label: '', requerido: false, opcionesTexto: ''
  };

  get camposActuales(): CampoFormulario[] { return this.selectedNode?.formulario ?? []; }

  abrirNuevoCampo() {
    this.campoForm = { nombre: '', tipo: 'TEXTO', label: '', requerido: false, opcionesTexto: '' };
    this.editingCampoIndex.set('new');
  }

  abrirEditarCampo(i: number) {
    const c = this.camposActuales[i];
    this.campoForm = { nombre: c.nombre, tipo: c.tipo, label: c.label, requerido: c.requerido, opcionesTexto: c.opciones?.join(', ') ?? '' };
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
        ? this.campoForm.opcionesTexto.split(',').map(s => s.trim()).filter(Boolean) : []
    };
    const campos = [...this.camposActuales];
    if (idx === 'new') campos.push(campo); else campos[idx] = campo;
    this.updateSelectedNode({ formulario: campos });
    this.editingCampoIndex.set(null);
  }

  eliminarCampo(i: number) {
    const campos = this.camposActuales.filter((_, idx) => idx !== i);
    this.updateSelectedNode({ formulario: campos });
    if (this.editingCampoIndex() === i) this.editingCampoIndex.set(null);
  }

  cancelarCampo() { this.editingCampoIndex.set(null); }

  crearDepartamentoInline() {
    const empresaId = this.proceso()?.empresaId;
    if (!empresaId || !this.newDeptoNombre.trim()) return;
    this.apiService.crearDepartamento(empresaId, { nombre: this.newDeptoNombre.trim(), descripcion: '' }).subscribe({
      next: (d) => {
        this.departamentosEmpresa.update(list => [...list, d]);
        this.agregarLaneCanvas(d); // también emite LANES_UPDATED internamente
        this.newDeptoNombre = '';
        this.showNewDepto.set(false);
        const nodo = this.selectedNode;
        if (nodo?.tipo === 'ACTIVIDAD') this.updateSelectedNode({ departamentoId: d.id });
      }
    });
  }

  // ── Plantillas ──────────────────────────────────────────────────────────────

  cargarPlantilla(tipo: 'SECUENCIAL' | 'CONDICIONAL' | 'PARALELO' | 'BUCLE') {
    if (this.proceso()?.estado !== 'BORRADOR') return;
    if (this.nodos().length > 0) {
      if (!confirm('Cargar una plantilla borrará tu diseño actual. ¿Deseas continuar?')) return;
    }
    this.selectedItem.set({ type: null, id: null });
    const genId = (p: string) => p + '_' + Math.random().toString(36).substring(2, 11);
    const cn = (t: Nodo['tipo'], l: string, x: number, y: number): Nodo => ({ id: genId('node'), tipo: t, label: l, posX: x, posY: y });
    const cc = (o: Nodo, d: Nodo, t: Conexion['tipo'] = 'NORMAL', cond = '', label = '', def = false): Conexion =>
      ({ id: genId('conn'), origenId: o.id, destinoId: d.id, tipo: t, condicion: cond, label, esDefault: def });

    let nuevosNodos: Nodo[] = [];
    let nuevasConexiones: Conexion[] = [];

    if (tipo === 'SECUENCIAL') {
      const [n1,n2,n3,n4,n5] = [cn('INICIO','Inicio',200,100),cn('ACTIVIDAD','Tarea 1',200,350),cn('ACTIVIDAD','Tarea 2',600,600),cn('ACTIVIDAD','Tarea 3',600,850),cn('FIN','Fin',400,1100)];
      nuevosNodos = [n1,n2,n3,n4,n5]; nuevasConexiones = [cc(n1,n2),cc(n2,n3),cc(n3,n4),cc(n4,n5)];
    } else if (tipo === 'CONDICIONAL') {
      const [n1,n2,n3,n4,n5,n6] = [cn('INICIO','Inicio',200,100),cn('ACTIVIDAD','Formulario Inicial',200,350),cn('ACTIVIDAD','Revisión y Decisión',200,600),cn('GATEWAY_XOR','¿Aprobado?',200,850),cn('FIN','Fin (Aprobado)',200,1100),cn('FIN','Fin (Rechazado)',600,1100)];
      n3.formulario = [{ nombre: 'aprobado', tipo: 'BOOLEANO', label: '¿Aprobar solicitud?', requerido: true, opciones: [] }];
      nuevosNodos = [n1,n2,n3,n4,n5,n6]; nuevasConexiones = [cc(n1,n2),cc(n2,n3),cc(n3,n4),cc(n4,n5,'CONDICIONAL','#aprobado == true','Sí'),cc(n4,n6,'CONDICIONAL','#aprobado == false','No')];
    } else if (tipo === 'PARALELO') {
      const [n1,n2,n3,n4,n5,n6] = [cn('INICIO','Inicio',400,100),cn('GATEWAY_AND','División',400,350),cn('ACTIVIDAD','Tarea A',200,600),cn('ACTIVIDAD','Tarea B',600,600),cn('GATEWAY_AND','Sincronización',400,850),cn('FIN','Fin',400,1100)];
      nuevosNodos = [n1,n2,n3,n4,n5,n6]; nuevasConexiones = [cc(n1,n2),cc(n2,n3),cc(n2,n4),cc(n3,n5),cc(n4,n5),cc(n5,n6)];
    } else if (tipo === 'BUCLE') {
      const [n1,n2,n3,n4,n5,n6] = [cn('INICIO','Inicio',400,100),cn('ACTIVIDAD','Elaborar Trabajo',400,350),cn('ACTIVIDAD','Control de Calidad',400,600),cn('GATEWAY_XOR','¿Calidad OK?',400,850),cn('FIN','Fin (Aprobado)',150,1100),cn('FIN','Fin (Rechazado Definitivo)',700,1100)];
      n3.formulario = [{ nombre: 'calidad_ok', tipo: 'BOOLEANO', label: '¿Pasa el control?', requerido: true, opciones: [] }];
      nuevosNodos = [n1,n2,n3,n4,n5,n6];
      nuevasConexiones = [
        cc(n1,n2),
        cc(n2,n3),
        cc(n3,n4),
        cc(n4,n5,'CONDICIONAL','#calidad_ok == true','Aprobado'),
        { ...cc(n4,n2,'RETORNO','#calidad_ok == false','Rechazado'), maxReintentos: 2 },
        cc(n4,n6,'NORMAL','','Reintentos agotados',true)
      ];
    }

    this.nodos.set(nuevosNodos);
    this.conexiones.set(nuevasConexiones);
    this.departamentosCanvas.set([]);
    this.snackBar.open(`Plantilla ${tipo} cargada. ¡Asigna los departamentos!`, 'OK', { duration: 4000 });
    this.wsService.publicar(this.procesoId, {
      tipo: 'DIAGRAM_RESET',
      data: { nodos: nuevosNodos, conexiones: nuevasConexiones }
    });
    this.autoGuardar();
  }

  // ── Paleta Drag & Drop ──────────────────────────────────────────────────────

  onDragStart(event: DragEvent, type: string) {
    event.dataTransfer?.setData('text/plain', type);
    this.draggedNodeType.set(type);
  }

  onDragOver(event: DragEvent) { event.preventDefault(); }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer?.getData('text/plain') as Nodo['tipo'];
    if (!type || !this.nodeTypes.find(n => n.type === type)) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / this.zoom();
    const y = (event.clientY - rect.top) / this.zoom();

    const nt = this.nodeTypes.find(n => n.type === type);
    const baseLabel = nt?.label || 'Nuevo';
    const countSameType = this.nodos().filter(n => n.tipo === type).length;
    const autoLabel = (type === 'INICIO' || type === 'FIN') ? baseLabel : `${baseLabel} ${countSameType + 1}`;

    const nuevoNodo: Nodo = {
      id: 'node_' + Math.random().toString(36).substr(2, 9),
      tipo: type, label: autoLabel,
      posX: Math.round(x), posY: Math.round(y)
    };

    const laneIndex = Math.floor(x / 400);
    const depts = this.departamentosCanvas();
    if (type === 'ACTIVIDAD' && depts[laneIndex]) nuevoNodo.departamentoId = depts[laneIndex].id;
    else if (type === 'ACTIVIDAD') nuevoNodo.departamentoId = depts[0]?.id;

    this.nodos.update(ns => [...ns, nuevoNodo]);
    this.seleccionarNodo(nuevoNodo.id);
    this.draggedNodeType.set(null);

    this.wsService.publicar(this.procesoId, { tipo: 'NODE_ADDED', data: { nodo: nuevoNodo } });
    this.autoGuardar(); // late joiners verán el nodo al cargar desde DB
  }

  // ── Mover Nodos ─────────────────────────────────────────────────────────────

  startNodeMove(event: MouseEvent | TouchEvent, nodeId: string) {
    if ((event.target as HTMLElement).classList.contains('port')) return;
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
    const node = this.nodos().find(n => n.id === nodeId);
    if (!node) return;
    this.movingNodeId.set(nodeId);
    this.seleccionarNodo(nodeId);
    this.offset = { x: clientX / this.zoom() - node.posX, y: clientY / this.zoom() - node.posY };
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onMouseMove(event: MouseEvent | TouchEvent) {
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    const movingId = this.movingNodeId();
    if (movingId) {
      const newX = Math.round(clientX / this.zoom() - this.offset.x);
      const newY = Math.round(clientY / this.zoom() - this.offset.y);
      this.nodos.update(ns => ns.map(n => n.id === movingId ? { ...n, posX: newX, posY: newY } : n));
      this.nodeMoveSubject.next({ nodeId: movingId, x: newX, y: newY });
    }

    const drawing = this.drawingConnection();
    if (drawing) {
      const wrapper = document.querySelector('.canvas-container')?.getBoundingClientRect();
      if (wrapper) {
        this.drawingConnection.update(d => d
          ? { ...d, currentX: (clientX - wrapper.left) / this.zoom(), currentY: (clientY - wrapper.top) / this.zoom() }
          : null
        );
      }
    }

    const wrapper = document.querySelector('.canvas-container')?.getBoundingClientRect();
    if (wrapper) {
      this.cursorSubject.next({
        x: (clientX - wrapper.left) / this.zoom(),
        y: (clientY - wrapper.top) / this.zoom()
      });
    }
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onMouseUp() {
    const movingId = this.movingNodeId();
    if (movingId) {
      const node = this.nodos().find(n => n.id === movingId);
      if (node?.tipo === 'ACTIVIDAD') this.autoAssignDepartment(movingId, node.posX);
      // Posición final exacta sin throttle
      const finalNode = this.nodos().find(n => n.id === movingId);
      if (finalNode) {
        this.wsService.publicar(this.procesoId, {
          tipo: 'NODE_MOVED', data: { id: movingId, posX: finalNode.posX, posY: finalNode.posY }
        });
      }
      this.autoGuardar(); // guarda posición final en DB para late joiners
    }
    this.movingNodeId.set(null);
    this.drawingConnection.set(null);
  }

  // ── Conexiones ──────────────────────────────────────────────────────────────

  startConnection(event: MouseEvent | TouchEvent, origenId: string) {
    event.stopPropagation();
    event.preventDefault();
    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
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
      const existe = this.conexiones().find(c => c.origenId === drawing.origenId && c.destinoId === destinoId);
      if (!existe) {
        const nueva: Conexion = {
          id: 'conn_' + Math.random().toString(36).substr(2, 9),
          origenId: drawing.origenId, destinoId,
          tipo: 'NORMAL', esDefault: false
        };
        this.conexiones.update(cs => [...cs, nueva]);
        this.seleccionarConexion(nueva.id);
        this.wsService.publicar(this.procesoId, { tipo: 'CONEXION_ADDED', data: { conexion: nueva } });
        this.autoGuardar();
      }
    }
    this.drawingConnection.set(null);
  }

  // ── Selección y propiedades ─────────────────────────────────────────────────

  seleccionarNodo(id: string) { this.selectedItem.set({ type: 'NODO', id }); }
  seleccionarConexion(id: string) { this.selectedItem.set({ type: 'CONEXION', id }); }
  unselect() { this.selectedItem.set({ type: null, id: null }); }
  getNode(id: string) { return this.nodos().find(n => n.id === id); }
  get selectedNode() { return this.nodos().find(n => n.id === this.selectedItem().id); }
  get selectedConexion() { return this.conexiones().find(c => c.id === this.selectedItem().id); }

  updateSelectedNode(data: Partial<Nodo>) {
    const id = this.selectedItem().id;
    if (data.departamentoId) {
      const node = this.nodos().find(x => x.id === id);
      if (node && node.departamentoId !== data.departamentoId) {
        let laneIndex = this.departamentosCanvas().findIndex((d: Departamento) => d.id === data.departamentoId);
        if (laneIndex < 0) {
          // Dept no está en el canvas todavía — agregarlo primero
          const dept = this.departamentosEmpresa().find(d => d.id === data.departamentoId);
          if (dept) {
            this.agregarLaneCanvas(dept); // también emite LANES_UPDATED
            laneIndex = this.departamentosCanvas().findIndex((d: Departamento) => d.id === data.departamentoId);
          }
        }
        if (laneIndex >= 0) data.posX = (laneIndex * 400) + 110;
      }
    }
    this.nodos.update(ns => ns.map(n => n.id === id ? { ...n, ...data } : n));

    // Broadcast nodo completo (debounced 400ms)
    const updated = this.nodos().find(n => n.id === id);
    if (updated) {
      this.nodeUpdateSubject.next(updated);
      this.autoSaveSubject.next();
    }
  }

  autoAssignDepartment(nodeId: string, x: number) {
    const laneIndex = Math.floor(x / 400);
    const depts = this.departamentosCanvas();
    if (depts[laneIndex]) {
      this.nodos.update(ns => ns.map(n => n.id === nodeId ? { ...n, departamentoId: depts[laneIndex].id } : n));
      const updated = this.nodos().find(n => n.id === nodeId);
      if (updated) {
        this.nodeUpdateSubject.next(updated);
        this.autoSaveSubject.next();
      }
    }
  }

  updateSelectedConexion(data: Partial<Conexion>) {
    const id = this.selectedItem().id;
    this.conexiones.update(cs => cs.map(c => c.id === id ? { ...c, ...data } : c));
    const updated = this.conexiones().find(c => c.id === id);
    if (updated) {
      this.wsService.publicar(this.procesoId, { tipo: 'CONEXION_UPDATED', data: { conexion: updated } });
      this.autoSaveSubject.next();
    }
  }

  get variablesDisponibles(): CampoFormulario[] {
    const conn = this.selectedConexion;
    if (!conn) return [];
    const sourceNode = this.getNode(conn.origenId);
    if (!sourceNode) return [];
    if (sourceNode.tipo === 'ACTIVIDAD') return sourceNode.formulario ?? [];
    if (sourceNode.tipo === 'GATEWAY_XOR' || sourceNode.tipo === 'GATEWAY_AND') {
      const campos: CampoFormulario[] = [];
      this.conexiones().filter(c => c.destinoId === sourceNode.id).forEach(ic => {
        const up = this.getNode(ic.origenId);
        if (up?.tipo === 'ACTIVIDAD') (up.formulario ?? []).forEach(c => {
          if (!campos.some(e => e.nombre === c.nombre)) campos.push(c);
        });
      });
      return campos;
    }
    return [];
  }

  insertarCondicion(expr: string) { this.updateSelectedConexion({ condicion: expr }); }

  eliminarNodo(id: string) {
    this.nodos.update(ns => ns.filter(n => n.id !== id));
    this.conexiones.update(cs => cs.filter(c => c.origenId !== id && c.destinoId !== id));
    if (this.selectedItem().id === id) this.unselect();
    this.wsService.publicar(this.procesoId, { tipo: 'NODE_DELETED', data: { id } });
    this.autoGuardar();
  }

  eliminarConexion(id: string) {
    this.conexiones.update(cs => cs.filter(c => c.id !== id));
    if (this.selectedItem().id === id) this.unselect();
    this.wsService.publicar(this.procesoId, { tipo: 'CONEXION_DELETED', data: { id } });
    this.autoGuardar();
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────

  getNodePort(id: string, type: 'top' | 'bottom') {
    const n = this.nodos().find(x => x.id === id);
    if (!n) return { x: 0, y: 0 };
    let w = 176, h = 60;
    if (n.tipo === 'INICIO' || n.tipo === 'FIN') { w = 60; h = 60; }
    else if (n.tipo === 'GATEWAY_XOR') { w = 100; h = 100; }
    else if (n.tipo === 'GATEWAY_AND') { w = 180; h = 24; }
    return type === 'top' ? { x: n.posX + w / 2, y: n.posY } : { x: n.posX + w / 2, y: n.posY + h };
  }

  // ── Guardar / Publicar ──────────────────────────────────────────────────────

  guardarBorrador() {
    const p = this.proceso();
    if (!p) return;
    this.procesoService.guardar(p.id, {
      nombre: p.nombre, descripcion: p.descripcion, empresaId: p.empresaId,
      nodos: this.nodos(), conexiones: this.conexiones()
    }).subscribe({
      next: () => this.snackBar.open('Diagrama guardado', 'OK', { duration: 3000 })
    });
  }

  validarDiagrama(): string | null {
    const nodos = this.nodos(), conexiones = this.conexiones();
    if (!nodos.some(n => n.tipo === 'INICIO')) return '⛔ Falta un nodo de Inicio.';
    if (!nodos.some(n => n.tipo === 'FIN')) return '⛔ Falta un nodo de Fin.';
    for (const inicio of nodos.filter(n => n.tipo === 'INICIO')) {
      if (!conexiones.some(c => c.origenId === inicio.id)) return `⛔ El nodo Inicio no tiene ninguna conexión saliente.`;
    }
    const sinDepto = nodos.filter(n => n.tipo === 'ACTIVIDAD' && !n.departamentoId);
    if (sinDepto.length > 0) return `⚠️ ${sinDepto.length} tarea(s) sin departamento: ${sinDepto.map(n => n.label).join(', ')}.`;
    for (const xor of nodos.filter(n => n.tipo === 'GATEWAY_XOR')) {
      if (conexiones.filter(c => c.origenId === xor.id).length < 2) return `⛔ La Decisión "${xor.label}" debe tener al menos 2 flechas.`;
    }
    for (const and of nodos.filter(n => n.tipo === 'GATEWAY_AND')) {
      if (conexiones.filter(c => c.origenId === and.id).length < 2 && conexiones.filter(c => c.destinoId === and.id).length < 2)
        return `⛔ El Paralelo "${and.label}" necesita múltiples flechas.`;
    }
    return null;
  }

  // ── Generación con IA ───────────────────────────────────────────────────────

  abrirModalIA() {
    this.iaModalVisible.set(true);
    this.iaFase.set('input');
    this.iaDescripcion = '';
    this.iaError.set('');
    this.iaResultadoPendiente = null;
    this.iaDeptsNuevos = [];
  }

  cerrarModalIA() {
    this.iaModalVisible.set(false);
    this.iaResultadoPendiente = null;
  }

  generarConIA() {
    if (!this.iaDescripcion.trim() || this.iaGenerando()) return;
    this.iaGenerando.set(true);
    this.iaError.set('');

    const depts = this.departamentosEmpresa().map(d => ({ id: d.id, nombre: d.nombre }));

    this.iaService.generarDiagrama({ descripcion: this.iaDescripcion, departamentos_existentes: depts })
      .subscribe({
        next: (resultado) => {
          this.iaGenerando.set(false);
          const nombresExistentes = this.departamentosEmpresa().map(d => d.nombre.toLowerCase());
          this.iaDeptsNuevos = (resultado.departamentos_sugeridos ?? [])
            .filter(n => !nombresExistentes.includes(n.toLowerCase()));
          this.iaResultadoPendiente = resultado;

          if (this.iaDeptsNuevos.length > 0) {
            this.iaFase.set('confirmar');
          } else {
            this.aplicarResultadoIA(resultado);
          }
        },
        error: () => {
          this.iaGenerando.set(false);
          this.iaError.set('No se pudo generar el diagrama. Verifica la API key y vuelve a intentarlo.');
        }
      });
  }

  async confirmarYAplicarIA() {
    if (!this.iaResultadoPendiente) return;
    this.iaGenerando.set(true);
    const empresaId = this.proceso()?.empresaId;
    if (empresaId) {
      for (const nombre of this.iaDeptsNuevos) {
        try {
          const dept = await firstValueFrom(
            this.apiService.crearDepartamento(empresaId, { nombre, descripcion: '' })
          );
          this.departamentosEmpresa.update(list => [...list, dept]);
        } catch { /* continúa con el resto */ }
      }
    }
    this.iaGenerando.set(false);
    this.aplicarResultadoIA(this.iaResultadoPendiente);
  }

  aplicarSinCrearDeptsIA() {
    if (!this.iaResultadoPendiente) return;
    this.aplicarResultadoIA(this.iaResultadoPendiente);
  }

  private aplicarResultadoIA(resultado: DiagramaIaResponse) {
    this.nodos.set(resultado.nodos);
    this.conexiones.set(resultado.conexiones);
    this.departamentosCanvas.set([]);
    this.selectedItem.set({ type: null, id: null });
    this.computarLanesVisibles();
    this.wsService.publicar(this.procesoId, {
      tipo: 'DIAGRAM_RESET',
      data: { nodos: resultado.nodos, conexiones: resultado.conexiones }
    });
    this.autoGuardar();
    this.cerrarModalIA();
    this.snackBar.open('✨ Diagrama generado con IA', 'OK', { duration: 4000 });
  }

  // ────────────────────────────────────────────────────────────────────────────

  publicar() {
    const p = this.proceso();
    if (!p) return;
    const error = this.validarDiagrama();
    if (error) { this.snackBar.open(error, 'Cerrar', { duration: 6000, panelClass: 'snack-warn' }); return; }
    this.procesoService.guardar(p.id, {
      nombre: p.nombre, descripcion: p.descripcion, empresaId: p.empresaId,
      nodos: this.nodos(), conexiones: this.conexiones()
    }).subscribe({
      next: () => {
        this.procesoService.publicar(p.id).subscribe({
          next: () => { this.snackBar.open('¡Proceso Publicado!', 'OK', { duration: 3000 }); this.router.navigate(['/dashboard']); },
          error: (err) => this.snackBar.open(err.error?.error || 'Error al publicar', 'Cerrar', { duration: 5000 })
        });
      }
    });
  }
}
