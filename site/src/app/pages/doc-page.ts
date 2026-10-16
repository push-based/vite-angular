import {DOCUMENT} from '@angular/common';
import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, inject, input, signal} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {Router, RouterLink, RouterLinkActive} from '@angular/router';
import {DOCS, SECTIONS, type Doc} from '../docs';
import {copyCodeOnClick} from '../layout/copy-code';
import {Seo} from '../layout/seo';

@Component({
  selector: 'app-doc-page',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './doc-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocPage {
  /** From the route's resolver: the compiled markdown page. */
  readonly doc = input.required<Doc>();

  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly sections = SECTIONS.map((name) => ({name, pages: DOCS.filter((d) => d.section === name)})).filter(
    (section) => section.pages.length > 0,
  );
  // The HTML comes from this repo's own markdown, compiled at build time.
  protected readonly html = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.doc().html));
  protected readonly neighbours = computed(() => {
    const i = DOCS.findIndex((d) => d.path === this.path());
    return {previous: DOCS[i - 1] ?? null, next: DOCS[i + 1] ?? null};
  });

  /** The docs menu on narrow screens, where the sidebar collapses behind a button. */
  protected readonly menuOpen = signal(false);
  protected readonly currentLabel = computed(() => DOCS.find((d) => d.path === this.path())?.label ?? 'Docs');

  /** The page's route, without the leading slash. */
  protected readonly path = computed(() => {
    this.doc();
    return this.router.url.split(/[?#]/)[0].replace(/^\//, '');
  });

  /** "16 October 2026", from the last commit that changed the page. */
  protected readonly updated = computed(() => {
    const date = this.doc().updated;
    if (!date) {
      return null;
    }
    const [year, month, day] = date.split('-').map(Number);
    return {iso: date, text: new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'})};
  });

  constructor() {
    const seo = inject(Seo);
    effect(() => {
      const doc = this.doc();
      seo.set({title: `${doc.title} · vite-plugin-ngp`, description: doc.description, path: this.path()});
    });

    // Rendering the article replaces its content, which undoes the router's scroll to a #fragment:
    // the page is briefly too short to stay scrolled. Scroll again once the content is in place.
    const document = inject(DOCUMENT);
    afterRenderEffect(() => {
      this.doc();
      const id = decodeURIComponent(document.location.hash.slice(1));
      if (id) {
        document.getElementById(id)?.scrollIntoView();
      }
    });
  }

  /** Links inside the markdown are plain anchors. Send the site's own ones through the router. */
  protected onContentClick(event: MouseEvent): void {
    if (copyCodeOnClick(event)) {
      return;
    }
    const anchor = (event.target as Element).closest('a');
    if (!anchor || anchor.target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    const url = new URL(anchor.href);
    if (url.origin !== location.origin || !url.pathname.startsWith(SITE_BASE)) {
      return;
    }
    event.preventDefault();
    this.router.navigateByUrl('/' + url.pathname.slice(SITE_BASE.length) + url.hash);
  }
}
