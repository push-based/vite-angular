import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {LOGO} from './logo-paths';

/** The vite-plugin-ngp mark, inline so the gear's color can follow the theme (`--logo-gear`). */
@Component({
  selector: 'app-logo',
  template: `
    <svg viewBox="0 0 256 256" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stop-color="#FF003C" />
          <stop offset="0.55" stop-color="#C21FB0" />
          <stop offset="1" stop-color="#7839EE" />
        </linearGradient>
      </defs>
      <path class="logo-gear" fill-rule="evenodd" [attr.d]="paths.gear" />
      <g transform="translate(128 131) scale(0.86) translate(-128 -127)">
        <path [attr.fill]="'url(#' + gradientId + ')'" [attr.d]="paths.shield" />
        <path fill="#FFFFFF" fill-rule="evenodd" [attr.d]="paths.letterA" />
      </g>
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly size = input(36);
  protected readonly paths = LOGO;
  // Each instance needs its own gradient id: the header and the hero both show the logo.
  protected readonly gradientId = `logo-shield-${nextId++}`;
}

let nextId = 0;
