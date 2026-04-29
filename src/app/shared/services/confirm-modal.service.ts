import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  // ── Confirm dialog ─────────────────────────────────────────────────────────
  confirmVisible = signal(false);
  confirmTitle   = signal('');
  confirmMessage = signal('');
  private _resolve: ((v: boolean) => void) | null = null;

  confirm(message: string, title = '¿Confirmar acción?'): Promise<boolean> {
    this.confirmTitle.set(title);
    this.confirmMessage.set(message);
    this.confirmVisible.set(true);
    return new Promise(resolve => { this._resolve = resolve; });
  }

  accept() {
    this.confirmVisible.set(false);
    this._resolve?.(true);
    this._resolve = null;
  }

  cancel() {
    this.confirmVisible.set(false);
    this._resolve?.(false);
    this._resolve = null;
  }

  // ── Toast notification ─────────────────────────────────────────────────────
  toastVisible  = signal(false);
  toastMessage  = signal('');
  toastType     = signal<'error' | 'info' | 'success'>('info');
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  toast(message: string, type: 'error' | 'info' | 'success' = 'info') {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.toastVisible.set(true);
    this._toastTimer = setTimeout(() => this.toastVisible.set(false), 3500);
  }
}
