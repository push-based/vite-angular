import {DOCUMENT, Injectable, effect, inject, signal} from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ngp-playground-theme';

/** Light, dark or follow the OS. Stored per browser; the page still works without storage. */
@Injectable({providedIn: 'root'})
export class ThemeService {
  readonly theme = signal<Theme>(readStoredTheme());

  constructor() {
    const root = inject(DOCUMENT).documentElement;
    effect(() => {
      const theme = this.theme();
      if (theme === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', theme);
      }
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Private mode or blocked storage: the choice lasts for this page only.
      }
    });
  }

  cycle(): void {
    const order: Theme[] = ['system', 'light', 'dark'];
    this.theme.update((t) => order[(order.indexOf(t) + 1) % order.length]);
  }
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
