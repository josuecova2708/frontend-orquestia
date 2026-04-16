import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './shared/services/auth';
import { Router } from '@angular/router';

// Guard: requiere login
const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

// Guard: requiere que el usuario YA tenga empresa configurada
const empresaSetupGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }
  if (auth.needsSetup()) {
    router.navigate(['/setup-empresa']);
    return false;
  }
  return true;
};

// Guard: la página de setup solo se accede si está logueado pero SIN empresa
const setupGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }
  if (!auth.needsSetup()) {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Páginas de Auth (sin guard — acceso público)
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then(m => m.Register)
  },

  // Onboarding (requiere login pero SIN empresa)
  {
    path: 'setup-empresa',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/setup-empresa/setup-empresa').then(m => m.SetupEmpresa)
  },

  // App principal (requiere login Y empresa configurada)
  {
    path: 'dashboard',
    canActivate: [empresaSetupGuard],
    loadComponent: () => import('./features/panel-funcionario/dashboard/dashboard').then(m => m.Dashboard)
  },
  {
    path: 'diagramador/:id',
    canActivate: [empresaSetupGuard],
    loadComponent: () => import('./features/diagramador/diagramador').then(m => m.Diagramador)
  },

  // Fallback
  { path: '**', redirectTo: 'login' }
];
