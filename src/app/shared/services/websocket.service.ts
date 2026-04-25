import { Injectable } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Subject, Observable } from 'rxjs';

export type DiagramaEventTipo =
  | 'NODE_MOVED' | 'NODE_ADDED' | 'NODE_DELETED' | 'NODE_UPDATED'
  | 'CONEXION_ADDED' | 'CONEXION_DELETED' | 'CONEXION_UPDATED'
  | 'LANES_UPDATED'
  | 'DIAGRAM_RESET'
  | 'CURSOR_MOVED';

export interface DiagramaEvent {
  tipo: DiagramaEventTipo;
  userId: string;
  userName: string;
  data: Record<string, unknown>;
}

export type UsuarioEventTipo = 'TAREA_ASIGNADA' | 'PROCESO_ASIGNADO' | 'DEPT_INVITACION';
export interface UsuarioEvent {
  tipo: UsuarioEventTipo;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private client: Client | null = null;
  private sub: StompSubscription | null = null;
  private events$ = new Subject<DiagramaEvent>();

  // Canal personal del usuario (persistente durante la sesión)
  private userClient: Client | null = null;
  private userSub: StompSubscription | null = null;
  private userEvents$ = new Subject<UsuarioEvent>();

  // Canal de empresa (para el dashboard admin)
  private empresaClient: Client | null = null;
  private empresaSub: StompSubscription | null = null;
  private empresaEvents$ = new Subject<Record<string, unknown>>();

  conectar(procesoId: string, token: string): Observable<DiagramaEvent> {
    this.desconectar();

    this.client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        this.sub = this.client!.subscribe(
          `/topic/diagrama/${procesoId}`,
          (msg: IMessage) => {
            try { this.events$.next(JSON.parse(msg.body) as DiagramaEvent); }
            catch { /* ignorar mensajes malformados */ }
          }
        );
      }
    });

    this.client.activate();
    return this.events$.asObservable();
  }

  publicar(procesoId: string, event: Omit<DiagramaEvent, 'userId' | 'userName'>) {
    if (this.client?.connected) {
      this.client.publish({
        destination: `/app/diagrama/${procesoId}`,
        body: JSON.stringify(event)
      });
    }
  }

  desconectar() {
    this.sub?.unsubscribe();
    this.client?.deactivate();
    this.client = null;
    this.sub = null;
  }

  conectarUsuario(userId: string, token: string): Observable<UsuarioEvent> {
    // Si ya está activo (conectando o conectado), reusar el Observable existente
    if (this.userClient?.active) return this.userEvents$.asObservable();

    this.userClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        this.userSub = this.userClient!.subscribe(
          `/topic/usuario/${userId}`,
          (msg: IMessage) => {
            try { this.userEvents$.next(JSON.parse(msg.body) as UsuarioEvent); }
            catch { /* ignorar */ }
          }
        );
      }
    });

    this.userClient.activate();
    return this.userEvents$.asObservable();
  }

  desconectarUsuario() {
    this.userSub?.unsubscribe();
    this.userClient?.deactivate();
    this.userClient = null;
    this.userSub = null;
  }

  conectarEmpresa(empresaId: string, token: string): Observable<Record<string, unknown>> {
    if (this.empresaClient?.active) return this.empresaEvents$.asObservable();

    this.empresaClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        this.empresaSub = this.empresaClient!.subscribe(
          `/topic/empresa/${empresaId}`,
          (msg: IMessage) => {
            try { this.empresaEvents$.next(JSON.parse(msg.body)); }
            catch { /* ignorar */ }
          }
        );
      }
    });

    this.empresaClient.activate();
    return this.empresaEvents$.asObservable();
  }

  desconectarEmpresa() {
    this.empresaSub?.unsubscribe();
    this.empresaClient?.deactivate();
    this.empresaClient = null;
    this.empresaSub = null;
  }
}
