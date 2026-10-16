import {DOCUMENT} from '@angular/common';
import {inject, Injectable} from '@angular/core';
import {Meta, Title} from '@angular/platform-browser';

export interface PageMeta {
  title: string;
  description: string;
  /** The route, relative to the site's base: '' for the home page, 'configuration' for a page. */
  path: string;
  /** Keep the page out of search results, such as the 404 page. */
  noindex?: boolean;
}

/**
 * Sets a page's title, description, canonical URL and social-card tags. Runs on the server
 * too, so the prerendered HTML carries them: link previews in Slack or on X never run JS.
 */
@Injectable({providedIn: 'root'})
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  set(page: PageMeta): void {
    // GitHub Pages serves each page from a folder, so its address ends in a slash.
    const url = SITE_URL + (page.path ? `${page.path}/` : '');
    this.title.setTitle(page.title);
    this.meta.updateTag({name: 'description', content: page.description});
    this.meta.updateTag({property: 'og:type', content: page.path ? 'article' : 'website'});
    this.meta.updateTag({property: 'og:site_name', content: 'vite-plugin-ngp'});
    this.meta.updateTag({property: 'og:title', content: page.title});
    this.meta.updateTag({property: 'og:description', content: page.description});
    this.meta.updateTag({property: 'og:url', content: url});
    this.meta.updateTag({name: 'twitter:card', content: 'summary'});
    if (page.noindex) {
      this.meta.updateTag({name: 'robots', content: 'noindex'});
    } else {
      this.meta.removeTag('name="robots"');
    }
    let canonical = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = url;
  }
}
