import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {ToastService} from '../core/toast';
import {Icon} from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    @for (toast of toasts.toasts(); track toast.id) {
      <div class="toast" [attr.data-tone]="toast.tone" role="status">
        <app-icon [name]="toast.tone === 'success' ? 'check' : 'sparkle'" [size]="16" />
        <span>{{ toast.message }}</span>
        <button type="button" class="dismiss" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">
          <app-icon name="close" [size]="14" />
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(360px, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.7rem 0.8rem 0.7rem 0.9rem;
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent-2);
      border-radius: 12px;
      background: var(--surface);
      box-shadow: var(--shadow);
      font-size: 0.9rem;
      animation: enter 180ms ease-out;
    }
    .toast[data-tone='success'] { border-left-color: var(--success); }
    .toast[data-tone='warning'] { border-left-color: var(--warning); }
    span { flex: 1; }
    .dismiss {
      display: inline-flex;
      padding: 4px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--text-faint);
      cursor: pointer;
    }
    .dismiss:hover { background: var(--surface-2); color: var(--text); }
    @keyframes enter { from { opacity: 0; transform: translateY(6px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  protected readonly toasts = inject(ToastService);
}
