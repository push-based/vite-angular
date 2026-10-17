import {afterNextRender, ChangeDetectionStrategy, Component, type ComponentRef, inject, signal, viewChild, ViewContainerRef} from '@angular/core';
import {DOCUMENT} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {Logo} from './layout/logo';
import {PushbasedLogo} from './layout/pushbased-logo';
import type {SearchDialog} from './search/search-dialog';

type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [Logo, PushbasedLogo, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'(document:keydown)': 'onKeydown($event)'},
})
export class App {
  private readonly document = inject(DOCUMENT);
  /**
   * The theme in effect. Unknown on the server, so the prerendered button carries no state and
   * both icons, and CSS shows the right one. The browser fills it in after hydration.
   */
  protected readonly theme = signal<Theme | null>(null);
  protected readonly build = SITE_BUILD;
  /** The search shortcut as the visitor's keyboard labels it. The server can't know, so it says Ctrl K. */
  protected readonly shortcut = signal('Ctrl K');

  private readonly searchHost = viewChild.required('searchHost', {read: ViewContainerRef});
  private search?: Promise<ComponentRef<SearchDialog>>;

  constructor() {
    afterNextRender(() => {
      this.theme.set(this.currentTheme());
      if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
        this.shortcut.set('⌘K');
      }
    });
  }

  /** ⌘K on a Mac, Ctrl+K elsewhere, opens search from anywhere. */
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearch();
    }
  }

  protected openSearch(): void {
    this.loadSearch().then(
      (ref) => ref.instance.open(),
      (error: unknown) => console.error(error),
    );
  }

  protected prefetchSearch(): void {
    this.loadSearch().catch(() => {});
  }

  /**
   * The dialog isn't in the main bundle: its code loads on the first open, or a moment earlier when
   * the pointer or focus reaches the button. Pagefind's script and index load when it opens.
   */
  private loadSearch(): Promise<ComponentRef<SearchDialog>> {
    this.search ??= import('./search/search-dialog').then(
      ({SearchDialog}) => {
        const ref = this.searchHost().createComponent(SearchDialog);
        ref.changeDetectorRef.detectChanges();
        return ref;
      },
      (error: unknown) => {
        this.search = undefined;
        throw error;
      },
    );
    return this.search;
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
