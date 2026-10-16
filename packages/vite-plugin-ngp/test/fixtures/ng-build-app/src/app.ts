import {ChangeDetectionStrategy, Component, type OnInit} from '@angular/core';
import {Banner} from './banner';
import {environment} from './environments/environment';

declare const Zone: {current: {name: string}} | undefined;

@Component({
  selector: 'app-root',
  imports: [Banner],
  // Checked on every change detection run, as components were before Angular 22 made OnPush the
  // default. zone.js decides when those runs happen.
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p id="status">{{ status }}</p>
    <p id="zone">{{ zoneAfterAwait }}</p>
    <p id="environment">{{ name }}</p>
    <app-banner />
  `,
  styles: `
    p {
      font-family: system-ui, sans-serif;
    }
  `,
})
export class App implements OnInit {
  // A plain field, not a signal: only zone.js can tell Angular it changed.
  status = 'loading';
  /** The zone the code after `await` ran in: `angular` if zone.js saw it, `<root>` if not. */
  zoneAfterAwait = '';
  name = environment.name;
  loading?: Promise<void>;

  ngOnInit() {
    this.loading = this.load();
  }

  private async load() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.status = 'loaded';
    this.zoneAfterAwait = typeof Zone === 'undefined' ? 'no zone.js' : Zone.current.name;
  }
}
