import { Component, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { MotorService } from '../../../shared/services/motor';
import { UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'orq-clientes-admin',
  standalone: true,
  imports: [FormsModule, DatePipe, MatIconModule, TopNavbarComponent],
  templateUrl: './clientes-admin.html',
  styleUrl: './clientes-admin.scss'
})
export class ClientesAdmin implements OnInit {

  clientes = signal<UsuarioResponse[]>([]);
  tramitesPorCliente = signal<Record<string, number>>({});
  loading = signal(true);
  busqueda = signal('');

  clientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const list = this.clientes();
    if (!q) return list;
    return list.filter(c =>
      `${c.nombre} ${c.apellido}`.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q));
  });

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private motor: MotorService,
    public router: Router
  ) {}

  ngOnInit() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) { this.router.navigate(['/dashboard']); return; }

    this.api.getFuncionarios(empresaId).subscribe({
      next: (list) => {
        this.clientes.set(
          list.filter(u => u.rol === 'CLIENTE')
              .sort((a, b) => (b.fechaCreacion ?? '').localeCompare(a.fechaCreacion ?? '')));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    // Contar trámites por cliente (enriquece la tabla)
    this.motor.listarInstancias(empresaId).subscribe({
      next: (insts) => {
        const conteo: Record<string, number> = {};
        for (const i of insts) {
          if (i.clienteId) conteo[i.clienteId] = (conteo[i.clienteId] ?? 0) + 1;
        }
        this.tramitesPorCliente.set(conteo);
      }
    });
  }

  tramitesDe(clienteId: string): number {
    return this.tramitesPorCliente()[clienteId] ?? 0;
  }

  iniciales(c: UsuarioResponse): string {
    return ((c.nombre?.[0] ?? '') + (c.apellido?.[0] ?? '')).toUpperCase();
  }
}
