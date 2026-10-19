import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {LOGO} from './logo-paths';

/** The vite-plugin-ngp mark, drawn by scripts/logo.mjs. The inside of the gear is transparent. */
@Component({
  selector: 'app-logo',
  template: `
    <svg viewBox="-424 -424 848 848" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
      <defs>
        @for (g of logo.gradients; track g.id) {
          <linearGradient
            [attr.id]="id(g.id)"
            [attr.gradientUnits]="g.id === 'gear' ? 'userSpaceOnUse' : null"
            [attr.x1]="g.x1" [attr.y1]="g.y1" [attr.x2]="g.x2" [attr.y2]="g.y2">
            @for (s of g.stops; track s.offset) {
              <stop [attr.offset]="s.offset" [attr.stop-color]="s.color" />
            }
          </linearGradient>
        }
        <mask [attr.id]="id('gap')" maskUnits="userSpaceOnUse" x="-424" y="-424" width="848" height="848">
          <path fill="#FFFFFF" [attr.d]="logo.box" />
          <path fill="#000000" stroke="#000000" [attr.stroke-width]="2 * logo.gap" [attr.d]="logo.parens" />
        </mask>
      </defs>
      <path
        [attr.fill]="url('gear')"
        fill-rule="evenodd"
        [attr.stroke]="url('gear')"
        stroke-width="10"
        stroke-linejoin="round"
        [attr.mask]="url('gap')"
        [attr.d]="logo.gear"
      />
      <path [attr.fill]="url('gear')" [attr.d]="logo.parens" />
      @for (facet of logo.facets; track facet[0]) {
        <path [attr.fill]="url(facet[0])" [attr.d]="facet[1]" />
      }
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly size = input(36);
  protected readonly logo = LOGO;
  // Each instance needs its own ids: the header and the hero both show the logo.
  private readonly prefix = `logo-${nextId++}-`;
  protected id(name: string) {
    return this.prefix + name;
  }
  protected url(name: string) {
    return `url(#${this.prefix}${name})`;
  }
}

let nextId = 0;
