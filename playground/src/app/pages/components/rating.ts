import {ChangeDetectionStrategy, Component, input, model, signal} from '@angular/core';
import {Icon} from '../../ui/icon';

/** Two-way binding with model(): the parent writes [(value)], the component writes back. */
@Component({
  selector: 'app-rating',
  imports: [Icon],
  template: `
    @for (star of stars(); track star) {
      <button
        type="button"
        [class.filled]="star <= (hovered() ?? value())"
        [attr.aria-label]="star + ' of ' + max()"
        [attr.aria-pressed]="star === value()"
        (mouseenter)="hovered.set(star)"
        (mouseleave)="hovered.set(null)"
        (click)="value.set(star)"
      >
        <app-icon name="star" [size]="26" />
      </button>
    }
  `,
  styles: `
    :host { display: inline-flex; gap: 0.15rem; }
    button { display: inline-flex; padding: 2px; border: 0; background: none; color: var(--border-strong); cursor: pointer; transition: transform 100ms ease, color 100ms ease; }
    button:hover { transform: scale(1.12); }
    .filled { color: #f5a524; }
    .filled ::ng-deep path { fill: currentColor; }
  `,
  host: {role: 'group', 'aria-label': 'Rating'},
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rating {
  readonly value = model(0);
  readonly max = input(5);
  protected readonly hovered = signal<number | null>(null);
  protected stars(): number[] {
    return Array.from({length: this.max()}, (_, i) => i + 1);
  }
}
