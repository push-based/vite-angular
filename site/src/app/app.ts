import {afterNextRender, ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {DOCUMENT} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {Logo} from './layout/logo';
import {PushbasedLogo} from './layout/pushbased-logo';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [Logo, PushbasedLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);
  /**
   * The theme in effect. Unknown on the server, so the prerendered button carries no state and
   * both icons, and CSS shows the right one. The browser fills it in after hydration.
   */
  protected readonly theme = signal<Theme | null>(null);
  protected readonly build = SITE_BUILD;

  constructor() {
    afterNextRender(() => this.theme.set(this.currentTheme()));
  }

  protected toggleTheme(): void {
    const next: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode or blocked storage: the choice lasts until the page closes.
    }
    this.theme.set(next);
  }

  /** An explicit choice (set by index.html's inline script, or a toggle), else the system's. */
  private currentTheme(): Theme {
    const chosen = this.document.documentElement.dataset['theme'];
    if (chosen === 'light' || chosen === 'dark') {
      return chosen;
    }
    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
