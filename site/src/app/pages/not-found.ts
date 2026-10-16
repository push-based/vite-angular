import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Seo} from '../layout/seo';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="section">
      <div class="container narrow">
        <p class="text-subtitle eyebrow">404</p>
        <h1 class="text-hero-title">That page doesn't exist</h1>
        <p class="text-lead">The link may be old, or the page may have moved.</p>
        <a class="pb-btn pb-btn-lg pb-btn-primary" routerLink="/getting-started">Go to the docs</a>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  constructor() {
    inject(Seo).set({
      title: 'Page not found · vite-plugin-ngp',
      description: "This page doesn't exist on the vite-plugin-ngp docs site.",
      path: '404',
      noindex: true,
    });
  }
}
