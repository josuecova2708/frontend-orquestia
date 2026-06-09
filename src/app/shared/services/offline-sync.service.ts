import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MotorService } from './motor';

/** Una operación "completar tarea" encolada mientras no había conexión. */
export interface OpPendiente {
  id?: number;
  tareaId: string;
  tareaLabel: string;
  datos: Record<string, unknown>;
  comentario: string;
  fecha: number;
}

/**
 * Cola offline para completar tareas (Fase 6 — PWA).
 *
 * Cuando el funcionario completa una tarea sin conexión, la operación se
 * persiste en IndexedDB y se reintenta automáticamente al recuperar la red.
 * Implementación nativa (sin la librería `idb`) para no agregar dependencias.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private motor = inject(MotorService);

  private readonly DB_NAME = 'orquestia-offline';
  private readonly STORE = 'cola-tareas';
  private dbPromise?: Promise<IDBDatabase>;

  /** Nº de operaciones pendientes de sincronizar. */
  pendientes = signal(0);
  /** Indica si una sincronización está en curso. */
  sincronizando = signal(false);
  /** Estado de conexión del navegador. */
  enLinea = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor() {
    window.addEventListener('online', () => this.enLinea.set(true));
    window.addEventListener('offline', () => this.enLinea.set(false));
    this.refrescarConteo();
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /** Encola una operación "completar tarea" para sincronizarla luego. */
  async encolar(op: Omit<OpPendiente, 'id' | 'fecha'>): Promise<void> {
    const store = await this.store('readwrite');
    await this.prom(store.add({ ...op, fecha: Date.now() }));
    await this.refrescarConteo();
  }

  /** Lista todas las operaciones pendientes (orden de inserción). */
  async listar(): Promise<OpPendiente[]> {
    const store = await this.store('readonly');
    return this.prom<OpPendiente[]>(store.getAll());
  }

  /**
   * Reenvía al backend todas las operaciones encoladas, en orden.
   * Se detiene en el primer fallo (sigue sin red / error) para reintentar luego.
   * @returns cuántas se sincronizaron con éxito.
   */
  async vaciarCola(): Promise<number> {
    if (!navigator.onLine || this.sincronizando()) return 0;
    const ops = await this.listar();
    if (ops.length === 0) return 0;

    this.sincronizando.set(true);
    let sincronizadas = 0;
    for (const op of ops) {
      try {
        await firstValueFrom(this.motor.completarTarea(op.tareaId, op.datos, op.comentario));
        if (op.id != null) await this.eliminar(op.id);
        sincronizadas++;
      } catch {
        break; // se reintentará en el próximo evento online / sincronización manual
      }
    }
    await this.refrescarConteo();
    this.sincronizando.set(false);
    return sincronizadas;
  }

  async refrescarConteo(): Promise<void> {
    const store = await this.store('readonly');
    const n = await this.prom<number>(store.count());
    this.pendientes.set(n);
  }

  // ── IndexedDB (helpers) ──────────────────────────────────────────────────────

  private abrir(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.abrir();
    return db.transaction(this.STORE, mode).objectStore(this.STORE);
  }

  private async eliminar(id: number): Promise<void> {
    const store = await this.store('readwrite');
    await this.prom(store.delete(id));
  }

  private prom<T>(req: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }
}
