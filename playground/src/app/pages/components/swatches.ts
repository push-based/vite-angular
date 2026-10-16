import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';

/** Emits the picked color through output(). */
@Component({
  selector: 'app-swatches',
  template: `
    @for (color of colors(); track color) {
      <button
        type="button"
        [style.--swatch]="color"
        [class.active]="color === selected()"
        [attr.aria-label]="'Pick ' + color"
        [attr.aria-pressed]="color === selected()"
        (click)="picked.emit(color)"
      ></button>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    button {
      width: 34px; height: 34px; padding: 0;
      border: 3px solid var(--surface); border-radius: 50%;
      background: var(--swatch); box-shadow: 0 0 0 1px var(--border-strong);
      cursor: pointer; transition: transform 100ms ease, box-shadow 100ms ease;
    }
    button:hover { transform: scale(1.08); }
    .active { box-shadow: 0 0 0 2px var(--swatch); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Swatches {
  readonly colors = input.required<string[]>();
  readonly selected = input<string>();
  readonly picked = output<string>();
}
