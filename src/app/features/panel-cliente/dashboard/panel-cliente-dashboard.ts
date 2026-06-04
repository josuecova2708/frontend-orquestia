import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../../shared/services/auth';
import { MotorService } from '../../../shared/services/motor';
import { InstanciaProceso } from '../../../shared/models/interfaces';

@Component({
  selector: 'orq-panel-cliente-dashboard',
  standalone: true,
  imports: [SlicePipe],
  templateUrl: './panel-cliente-dashboard.html',
  styleUrl: './panel-cliente-dashboard.scss'
})
export class PanelClienteDashboard implements OnInit {
  instancias = signal<InstanciaProceso[]>([]);
  loading = signal(true);

  constructor(
    public auth: AuthService,
    private motor: MotorService,
    private router: Router
  ) {}

  ngOnInit() {
    this.motor.obtenerMisInstancias().subscribe({
      next: (data) => {
        this.instancias.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      ACTIVA: 'badge--activa',
      COMPLETADA: 'badge--completada',
      CANCELADA: 'badge--cancelada',
      ERROR: 'badge--error'
    };
    return map[estado] ?? '';
  }
}
