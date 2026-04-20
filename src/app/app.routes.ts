import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './shared/services/auth';
import { Router } from '@angular/router';

const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  return true;
};

// Guard: solo accede si tiene empresa configurada y seleccionada
const empresaSetupGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  if (auth.needsSelection()) { router.navigate(['/seleccionar-empresa']); return false; }
  if (auth.needsSetup()) { router.navigate(['/setup-empresa']); return false; }
  return true;
};

// Guard: /setup-empresa solo si está logueado y sin ninguna empresa
const setupGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  if (!auth.needsSetup()) {
    if (auth.needsSelection()) { router.navigate(['/seleccionar-empresa']); return false; }
    const dest = auth.user()?.rol === 'FUNCIONARIO' ? '/mis-tareas' : '/dashboard';
    router.navigate([dest]);
    return false;
  }
  return true;
};

// Guard: /seleccionar-empresa solo si está logueado y tiene varias empresas sin seleccionar
const selectorGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  if (!auth.needsSelection()) {
    if (auth.needsSetup()) { router.navigate(['/setup-empresa']); return false; }
    const dest = auth.user()?.rol === 'FUNCIONARIO' ? '/mis-tareas' : '/dashboard';
    router.navigate([dest]);
    return false;
  }
  return true;
};

// Guard: solo ADMIN puede acceder
const adminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) { router.navigate(['/login']); return false; }
  if (auth.needsSelection()) { router.navigate(['/seleccionar-empresa']); return false; }
  if (auth.needsSetup()) { router.navigate(['/setup-empresa']); return false; }
  if (auth.user()?.rol !== 'ADMIN') { router.navigate(['/mis-tareas']); return false; }
  return true;
};

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then(m => m.Register)
  },

  {
    path: 'setup-empresa',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/setup-empresa/setup-empresa').then(m => m.SetupEmpresa)
  },
  {
    path: 'seleccionar-empresa',
    canActivate: [selectorGuard],
    loadComponent: () => import('./features/auth/seleccionar-empresa/seleccionar-empresa').then(m => m.SelectorEmpresa)
  },

  {
    path: 'dashboard',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/panel-funcionario/dashboard/dashboard').then(m => m.Dashboard)
  },
  {
    path: 'mis-tareas',
    canActivate: [empresaSetupGuard],
    loadComponent: () => import('./features/panel-funcionario/mis-tareas/mis-tareas').then(m => m.MisTareas)
  },
  {
    path: 'diagramador/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/diagramador/diagramador').then(m => m.Diagramador)
  },
  {
    path: 'usuarios',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/usuarios/usuarios-admin').then(m => m.UsuariosAdmin)
  },
  {
    path: 'administradores',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/administradores/administradores').then(m => m.AdministradoresAdmin)
  },

  { path: '**', redirectTo: 'login' }
];
