import {DOCUMENT} from '@angular/common';
import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, inject, input} from '@angular/core';
import {DomSanitizer, Meta, Title} from '@angular/platform-browser';
import {Router, RouterLink, RouterLinkActive} from '@angular/router';
import {DOCS, SECTIONS, type Doc} from '../docs';

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
    const path = this.router.url.split(/[?#]/)[0].replace(/^\//, '');
    const i = DOCS.findIndex((d) => d.path === path);
    return {previous: DOCS[i - 1] ?? null, next: DOCS[i + 1] ?? null};
  });

  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    effect(() => {
      const doc = this.doc();
      title.setTitle(`${doc.title} · vite-plugin-ngp`);
      meta.updateTag({name: 'description', content: doc.description});
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
