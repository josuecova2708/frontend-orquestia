import {
  Component, signal, ViewChild, ElementRef,
  AfterViewChecked, computed, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ToscaniniService, ToscaniniMensaje } from '../../services/toscanini.service';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-toscanini-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './toscanini-chat.html',
  styleUrl: './toscanini-chat.scss'
})
export class ToscaniniChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('mensajesContainer') mensajesContainer!: ElementRef<HTMLDivElement>;

  abierto = signal(false);
  mostrarBurbuja = signal(false);
  historial = signal<ToscaniniMensaje[]>([]);
  inputTexto = '';
  cargando = signal(false);
  private debeScrollear = false;

  tieneHistorial = computed(() => this.historial().length > 0);

  constructor(
    private toscanini: ToscaniniService,
    public auth: AuthService
  ) {}

  ngOnInit() {
    // Muestra la burbuja después de 1.5s y la oculta a los 4s
    setTimeout(() => {
      this.mostrarBurbuja.set(true);
      setTimeout(() => this.mostrarBurbuja.set(false), 4000);
    }, 1500);
  }

  ngAfterViewChecked() {
    if (this.debeScrollear) {
      this.scrollAlFinal();
      this.debeScrollear = false;
    }
  }

  toggleChat() {
    this.mostrarBurbuja.set(false);
    this.abierto.update(v => !v);
    if (this.abierto() && this.historial().length === 0) {
      // Mensaje de bienvenida
      this.historial.set([{
        rol: 'toscanini',
        mensaje: '¡Hola! Soy **Toscanini** 🎼, tu asistente en Orquestia BPM Studio.\n\n¿En qué puedo ayudarte? Puedo explicarte cómo crear procesos, configurar el diagramador, gestionar usuarios y mucho más.'
      }]);
    }
    this.debeScrollear = true;
  }

  cerrar() {
    this.abierto.set(false);
  }

  limpiarChat() {
    this.historial.set([]);
    this.inputTexto = '';
  }

  async enviar() {
    const texto = this.inputTexto.trim();
    if (!texto || this.cargando()) return;

    // Agrega mensaje del usuario
    this.historial.update(h => [...h, { rol: 'usuario', mensaje: texto }]);
    this.inputTexto = '';
    this.cargando.set(true);
    this.debeScrollear = true;

    this.toscanini.preguntar(this.historial()).subscribe({
      next: (res) => {
        this.historial.update(h => [...h, { rol: 'toscanini', mensaje: res.respuesta }]);
        this.cargando.set(false);
        this.debeScrollear = true;
      },
      error: () => {
        this.historial.update(h => [...h, {
          rol: 'toscanini',
          mensaje: 'Lo siento, tuve un problema al procesar tu consulta. Por favor intenta de nuevo.'
        }]);
        this.cargando.set(false);
        this.debeScrollear = true;
      }
    });
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.enviar();
    }
  }

  private scrollAlFinal() {
    if (this.mensajesContainer) {
      const el = this.mensajesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  // Convierte markdown básico a HTML
  formatearMensaje(texto: string): string {
    return texto
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
}
