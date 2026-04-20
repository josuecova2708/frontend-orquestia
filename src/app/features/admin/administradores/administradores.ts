import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../../shared/services/auth';
import { ApiService } from '../../../shared/services/api';
import { UsuarioResponse } from '../../../shared/models/interfaces';
import { TopNavbarComponent } from '../../../shared/components/top-navbar/top-navbar.component';

@Component({
  selector: 'app-administradores',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, TopNavbarComponent
  ],
  templateUrl: './administradores.html',
  styleUrl: './administradores.scss'
})
export class AdministradoresAdmin implements OnInit {
  administradores = signal<UsuarioResponse[]>([]);
  loading = signal(true);

  // Invitar co-admin
  showInvitar = signal(false);
  invitarEmail = '';
  invitarNombre = '';
  invitarApellido = '';
  invitarPassword = '';
  enviandoInvitacion = signal(false);
  mensajeInvitacion = signal('');

  constructor(
    public auth: AuthService,
    private api: ApiService,
    public router: Router
  ) {}

  ngOnInit() {
    const user = this.auth.user();
    if (!user?.empresaId) { this.router.navigate(['/dashboard']); return; }

    this.cargarAdmins(user.empresaId);
  }

  cargarAdmins(empresaId: string) {
    this.loading.set(true);
    this.api.getFuncionarios(empresaId).subscribe({
      next: (list) => {
        // Here we filter by rol === 'ADMIN'
        this.administradores.set(list.filter(u => u.rol === 'ADMIN'));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  invitarAdmin() {
    const empresaId = this.auth.user()?.empresaId;
    if (!empresaId) return;
    this.enviandoInvitacion.set(true);
    this.mensajeInvitacion.set('');
    
    this.auth.invitarAdmin({
      email: this.invitarEmail,
      nombre: this.invitarNombre,
      apellido: this.invitarApellido,
      password: this.invitarPassword,
      empresaId
    }).subscribe({
      next: () => {
        this.enviandoInvitacion.set(false);
        this.mensajeInvitacion.set(`Invitación enviada a ${this.invitarEmail}`);
        this.showInvitar.set(false);
        this.invitarEmail = '';
        this.invitarNombre = '';
        this.invitarApellido = '';
        this.invitarPassword = '';
        this.cargarAdmins(empresaId); // refresh list
      },
      error: () => {
        this.enviandoInvitacion.set(false);
        this.mensajeInvitacion.set('Error al enviar la invitación');
      }
    });
  }
}
