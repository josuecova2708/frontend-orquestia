import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth';
import { NotificacionService } from '../../services/notificacion.service';
import { WebSocketService } from '../../services/websocket.service';
import { Notificacion } from '../../models/interfaces';

@Component({
  selector: 'app-top-navbar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, RouterModule],
  templateUrl: './top-navbar.html',
  styleUrl: './top-navbar.scss'
})
export class TopNavbarComponent implements OnInit, OnDestroy {
  notificaciones = signal<Notificacion[]>([]);
  panelAbierto = signal(false);
  private wsSub: Subscription | null = null;

  constructor(
    public auth: AuthService,
    public router: Router,
    private notifService: NotificacionService,
    private wsService: WebSocketService
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    const token = this.auth.token();
    if (!user || !token) return;

    this.cargarNotificaciones();

    // Escuchar eventos del canal personal para refrescar al llegar una nueva notificación
    this.wsSub = this.wsService.conectarUsuario(user.userId, token).subscribe(() => {
      this.cargarNotificaciones();
    });
  }

  ngOnDestroy() {
    this.wsSub?.unsubscribe();
  }

  cargarNotificaciones() {
    this.notifService.listar().subscribe({
      next: (list) => this.notificaciones.set(list)
    });
  }

  get noLeidas(): number {
    return this.notificaciones().filter(n => !n.leida).length;
  }

  togglePanel() {
    this.panelAbierto.update(v => !v);
  }

  cerrarPanel() {
    this.panelAbierto.set(false);
  }

  leerNotificacion(n: Notificacion) {
    if (n.leida) return;
    this.notifService.marcarLeida(n.id).subscribe({
      next: (updated) => {
        this.notificaciones.update(list => list.map(x => x.id === n.id ? updated : x));
      }
    });
  }

  leerTodas() {
    this.notifService.marcarTodasLeidas().subscribe({
      next: () => {
        this.notificaciones.update(list => list.map(n => ({ ...n, leida: true })));
      }
    });
  }

  iconoTipo(tipo: string): string {
    if (tipo === 'TAREA_ASIGNADA') return 'assignment';
    if (tipo === 'PROCESO_ASIGNADO') return 'account_tree';
    return 'group_add'; // DEPT_INVITACION
  }

  logout() {
    this.auth.logout();
    this.wsService.desconectarUsuario();
    this.router.navigate(['/login']);
  }

  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }
}
