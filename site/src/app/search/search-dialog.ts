import {ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild} from '@angular/core';
import {Router} from '@angular/router';

/**
 * The search dialog. App imports this file only when someone first opens search (or points at
 * the search button), and the dialog loads Pagefind's script and index only when it opens, so
 * neither costs anything on first paint. scripts/search-index.mjs builds the index at build time,
 * from the prerendered pages, into dist/client/pagefind.
 */
@Component({
  selector: 'app-search-dialog',
  templateUrl: './search-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchDialog {
  private readonly router = inject(Router);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly status = signal<'loading' | 'ready' | 'unavailable'>('loading');
  protected readonly items = signal<SearchItem[]>([]);
  protected readonly active = signal(0);
  protected readonly activeId = computed(() => (this.items().length ? itemId(this.active()) : null));
  protected readonly pageCount = computed(() => this.items().filter((item) => item.kind === 'page').length);
  protected readonly itemId = itemId;

  private pagefind?: Promise<Pagefind | null>;
  /** The element that had focus before the dialog opened, to give it back on close. */
  private opener: HTMLElement | null = null;

  open(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    this.opener = document.activeElement as HTMLElement | null;
    dialog.showModal();
    this.input().nativeElement.select();
    this.pagefind ??= loadPagefind().then((pagefind) => {
      this.status.set(pagefind ? 'ready' : 'unavailable');
      return pagefind;
    });
    // Rerun the query typed before the index loaded, or kept from last time.
    if (this.query()) {
      void this.search(this.query());
    }
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    this.opener?.focus();
    this.opener = null;
  }

  /** A click on the dialog itself, not its panel, is a click on the backdrop. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  protected onInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.query.set(query);
    void this.search(query);
  }

  /** Arrow keys move through the results while focus stays in the field; Enter opens one. */
  protected onKeydown(event: KeyboardEvent): void {
    const count = this.items().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!count) {
        return;
      }
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.setActive((this.active() + step + count) % count);
    } else if (event.key === 'Home' && count && event.ctrlKey) {
      event.preventDefault();
      this.setActive(0);
    } else if (event.key === 'End' && count && event.ctrlKey) {
      event.preventDefault();
      this.setActive(count - 1);
    } else if (event.key === 'Enter' && count && !event.isComposing) {
      event.preventDefault();
      const item = this.items()[this.active()];
      if (event.metaKey || event.ctrlKey) {
        window.open(item.url, '_blank', 'noopener');
      } else {
        this.go(item.url);
      }
    }
  }

  /** A plain click goes through the router; a click to open in a new tab or window doesn't. */
  protected onResultClick(event: MouseEvent, url: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.go(url);
  }

  protected setActive(index: number): void {
    this.active.set(index);
    this.dialog()
      .nativeElement.querySelector(`#${itemId(index)}`)
      ?.scrollIntoView({block: 'nearest'});
  }

  private go(url: string): void {
    this.close();
    // '/vite-angular/configuration/#typecheck' → '/configuration#typecheck'
    const route = '/' + (url.startsWith(SITE_BASE) ? url.slice(SITE_BASE.length) : url).replace(/\/(?=#|$)/, '');
    void this.router.navigateByUrl(route);
  }

  private async search(query: string): Promise<void> {
    const pagefind = await this.pagefind;
    if (!pagefind) {
      return;
    }
    if (!query.trim()) {
      this.items.set([]);
      return;
    }
    // Resolves to null when a newer query has replaced this one.
    const found = await pagefind.debouncedSearch(query, {}, 120);
    if (!found || query !== this.query()) {
      return;
    }
    const pages = await Promise.all(found.results.slice(0, MAX_PAGES).map((r) => r.data()));
    if (query !== this.query()) {
      return;
    }
    this.items.set(pages.flatMap(toItems));
    this.active.set(0);
  }
}

const MAX_PAGES = 8;
const MAX_HEADINGS = 3;

interface SearchItem {
  kind: 'page' | 'heading';
  url: string;
  title: string;
  /** HTML: text with the matched words in <mark>. */
  excerpt: string;
}

function itemId(index: number): string {
  return `search-result-${index}`;
}

/** A page, then the sections of it that match best, in the order they appear on the page. */
function toItems(page: PagefindResultData): SearchItem[] {
  const headings = page.sub_results
    .filter((sub) => sub.anchor && sub.anchor.element !== 'h1')
    .map((sub, order) => ({sub, order}))
    .sort((a, b) => b.sub.locations.length - a.sub.locations.length)
    .slice(0, MAX_HEADINGS)
    .sort((a, b) => a.order - b.order)
    .map(({sub}): SearchItem => ({kind: 'heading', url: sub.url, title: sub.title, excerpt: sub.excerpt}));
  // When the best match is under a heading, the page's excerpt is that heading's: show it once.
  const excerpt = headings.some((h) => h.excerpt === page.excerpt) ? '' : page.excerpt;
  return [{kind: 'page', url: page.url, title: page.meta.title ?? page.url, excerpt}, ...headings];
}

/** Null when there's no index to load: in `vite` dev, which doesn't run the build's indexing step. */
async function loadPagefind(): Promise<Pagefind | null> {
  try {
    const pagefind: Pagefind = await import(/* @vite-ignore */ `${SITE_BASE}pagefind/pagefind.js`);
    await pagefind.options({baseUrl: SITE_BASE, excerptLength: 18});
    await pagefind.init();
    return pagefind;
  } catch {
    return null;
  }
}

// The parts of Pagefind's browser API (https://pagefind.app/docs/api/) the dialog uses.
interface Pagefind {
  options(options: {baseUrl?: string; excerptLength?: number}): Promise<void>;
  init(): Promise<void>;
  debouncedSearch(query: string, options: object, timeoutMs: number): Promise<{results: {data(): Promise<PagefindResultData>}[]} | null>;
}

interface PagefindResultData {
  url: string;
  excerpt: string;
  meta: {title?: string};
  sub_results: {
    title: string;
    url: string;
    excerpt: string;
    locations: number[];
    anchor?: {element: string; id: string};
  }[];
}
