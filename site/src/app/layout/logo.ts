import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/** The vite-plugin-ngp mark: public/logo.svg, drawn by scripts/logo.mjs. Its colors are fixed, so it needs no theme. */
@Component({
  selector: 'app-logo',
  template: `<img src="logo.svg" alt="" [attr.width]="size()" [attr.height]="size()" decoding="async" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  readonly size = input(36);
}
