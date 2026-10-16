import {ChangeDetectionStrategy, Component, signal} from '@angular/core';

/**
 * Styled with SCSS: a `@use`d partial, a mixin and an `@each` loop, all compiled by Vite's Sass
 * support before the plugin scopes the result. The click count is there to show that a style edit
 * updates in place: the count survives it, where a page reload would reset it to 0.
 */
@Component({
  selector: 'app-scss-meter',
  template: `
    <div class="meter" aria-hidden="true">
      @for (level of levels; track level) {
        <span class="level level-{{ level }}" [class.on]="level <= count()"></span>
      }
    </div>
    <button type="button" (click)="count.set((count() % levels.length) + 1)">
      Level {{ count() }} of {{ levels.length }}
    </button>
  `,
  styleUrl: './scss-meter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScssMeter {
  protected readonly levels = [1, 2, 3, 4, 5];
  protected readonly count = signal(0);
}
