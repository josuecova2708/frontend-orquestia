import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth';
import { Documento, IniciarUploadResponse, OnlyOfficeConfig } from '../models/interfaces';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DocumentoService {

  private baseUrl = `${environment.apiUrl}/api/documentos`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  private headers() {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.token()}` });
  }

  listarPorEmpresa(empresaId: string): Observable<Documento[]> {
    return this.http.get<Documento[]>(`${this.baseUrl}/empresa/${empresaId}`, { headers: this.headers() });
  }

  listarPorInstancia(instanciaId: string): Observable<Documento[]> {
    return this.http.get<Documento[]>(`${this.baseUrl}/instancia/${instanciaId}`, { headers: this.headers() });
  }

  listarMisDocumentos(): Observable<Documento[]> {
    return this.http.get<Documento[]>(`${this.baseUrl}/mis-documentos`, { headers: this.headers() });
  }

  // Documentos del CLIENTE autenticado (los que le pertenecen)
  listarMisDocumentosCliente(): Observable<Documento[]> {
    return this.http.get<Documento[]>(`${environment.apiUrl}/api/cliente/mis-documentos`, { headers: this.headers() });
  }

  iniciarUpload(data: {
    nombre: string;
    mimeType: string;
    size: number;
    empresaId: string;
    instanciaId?: string;
    tareaId?: string;
    procesoId?: string;
    tipo?: string;
  }): Observable<IniciarUploadResponse> {
    return this.http.post<IniciarUploadResponse>(`${this.baseUrl}/iniciar-upload`, data, { headers: this.headers() });
  }

  // Sube el archivo directamente a MinIO usando la URL presignada (sin auth header)
  subirAMinio(uploadUrl: string, file: File): Observable<void> {
    return this.http.put<void>(uploadUrl, file, {
      headers: new HttpHeaders({ 'Content-Type': file.type })
    });
  }

  obtenerUrlDescarga(id: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.baseUrl}/${id}/descargar`, { headers: this.headers() });
  }

  obtenerEditorConfig(id: string, soloLectura = false): Observable<OnlyOfficeConfig> {
    return this.http.get<OnlyOfficeConfig>(
      `${this.baseUrl}/${id}/editor-config?soloLectura=${soloLectura}`,
      { headers: this.headers() }
    );
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { headers: this.headers() });
  }
}
