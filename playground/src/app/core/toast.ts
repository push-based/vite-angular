import {Injectable, signal} from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warning';
}

/** A root service, shared through DI by every page that wants to say something. */
@Injectable({providedIn: 'root'})
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, tone: Toast['tone'] = 'info'): void {
    const toast = {id: this.nextId++, message, tone};
    this.toasts.update((list) => [...list, toast].slice(-4));
    setTimeout(() => this.dismiss(toast.id), 3200);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
