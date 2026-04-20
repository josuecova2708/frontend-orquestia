import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-top-navbar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, RouterModule],
  templateUrl: './top-navbar.html',
  styleUrl: './top-navbar.scss'
})
export class TopNavbarComponent {
  constructor(public auth: AuthService, public router: Router) {}

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
  
  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }
}
