import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ToscaniniMensaje {
  rol: 'usuario' | 'toscanini';
  mensaje: string;
}

@Injectable({ providedIn: 'root' })
export class ToscaniniService {
  private iaUrl = `${environment.iaUrl}/ia/toscanini`;

  constructor(private http: HttpClient) {}

  preguntar(historial: ToscaniniMensaje[]) {
    return this.http.post<{ respuesta: string }>(this.iaUrl, { historial });
  }
}
