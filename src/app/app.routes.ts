import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/panel-funcionario/dashboard/dashboard').then(m => m.Dashboard)
  },
  {
    path: 'diagramador/:id',
    loadComponent: () => import('./features/diagramador/diagramador').then(m => m.Diagramador)
  }
];
