import {ChangeDetectionStrategy, Component, input} from '@angular/core';

@Component({
  selector: 'app-greeting',
  template: `<p class="greeting">Hello, {{ name() }}!</p>`,
  styles: `.greeting { font-weight: bold; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Greeting {
  readonly name = input.required<string>();
}
