import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'orq-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('Orquestia');
  protected readonly backendStatus = signal<string>('Conectando...');
  protected readonly backendVersion = signal<string>('');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.http.get<any>('http://localhost:8080/api/health').subscribe({
      next: (res) => {
        this.backendStatus.set(res.status);
        this.backendVersion.set(res.version);
      },
      error: (err) => {
        this.backendStatus.set('ERROR');
        console.error('Backend no disponible:', err);
      }
    });
  }
}
