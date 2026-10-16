import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
  selector: 'app-about',
  template: `<h1>About</h1><p>This route is lazy-loaded.</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {}
