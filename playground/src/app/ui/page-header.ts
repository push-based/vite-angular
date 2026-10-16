import {ChangeDetectionStrategy, Component, input} from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <p class="eyebrow">{{ eyebrow() }}</p>
    <h1>{{ title() }}</h1>
    <p class="lede"><ng-content /></p>
    @if (covers().length) {
      <ul class="covers" aria-label="What this page exercises">
        @for (item of covers(); track item) {
          <li><code>{{ item }}</code></li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; margin-bottom: 2rem; }
    .eyebrow {
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--accent);
    }
    h1 { margin-top: 0.35rem; font-size: clamp(1.8rem, 3vw, 2.4rem); font-weight: 750; }
    .lede { margin-top: 0.6rem; max-width: 62ch; font-size: 1.02rem; color: var(--text-muted); }
    .covers { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 1rem 0 0; padding: 0; list-style: none; }
    .covers code { display: inline-block; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly eyebrow = input('Demo');
  readonly title = input.required<string>();
  readonly covers = input<string[]>([]);
}
