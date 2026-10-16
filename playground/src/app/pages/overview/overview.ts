import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, LOCALE_ID, VERSION, afterNextRender, inject, isDevMode, signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {environment} from '../../../environments/environment';
import {FEATURES} from '../../core/features';
import {Icon} from '../../ui/icon';

@Component({
  selector: 'app-overview',
  imports: [RouterLink, Icon, DatePipe],
  templateUrl: './overview.html',
  styleUrl: './overview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  protected readonly features = FEATURES;
  protected readonly angular = VERSION.full;
  protected readonly devMode = isDevMode();
  protected readonly hmr = !!import.meta.hot;
  protected readonly mode = import.meta.env.MODE;
  /** Which environment file was compiled: the plugin's fileReplacements swap it in builds. */
  protected readonly environmentFile = environment.file;
  /** Formatted with the locale's data, which the plugin registers: a German build shows a German date. */
  protected readonly locale = inject(LOCALE_ID);
  protected readonly today = new Date();
  /**
   * When DOMContentLoaded finished: by then the browser has fetched and run every module script,
   * which in dev means every module ngp compiled for this page. Read from navigation timing, so an
   * HMR update that recreates this component shows the same number.
   */
  protected readonly loadedMs = signal<number | null>(null);

  protected readonly pipeline = [
    {step: $localize`Vite asks for a module`, detail: $localize`Only what the browser imports, when it imports it.`, icon: 'layers'},
    {step: $localize`ngp compiles it`, detail: $localize`Rust analyzer plus Angular's template compiler, in optimize mode.`, icon: 'cpu'},
    {step: $localize`Vite strips the types`, detail: $localize`ngp returns TypeScript; Vite's oxc transform does the rest.`, icon: 'bolt'},
    {step: $localize`Edits update in place`, detail: $localize`Template edits arrive over HMR without a reload.`, icon: 'flame'},
  ] as const;

  constructor() {
    afterNextRender(() => {
      const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const end = navigation?.domContentLoadedEventEnd;
      this.loadedMs.set(Math.round(end && end > 0 ? end : performance.now()));
    });
  }
}
