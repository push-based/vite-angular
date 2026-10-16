import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {FEATURES} from '../../core/features';
import {Icon} from '../../ui/icon';
import {PageHeader} from '../../ui/page-header';

@Component({
  selector: 'app-router-demo',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon, PageHeader],
  template: `
    <app-page-header eyebrow="Navigation" title="Router" [covers]="['loadComponent', 'children', ':slug', 'withComponentInputBinding', 'routerLinkActive']">
      This page is a lazy route with child routes. Each detail view is lazy too, and gets
      <code>:slug</code> from the URL as a plain signal <code>input()</code>: no
      <code>ActivatedRoute</code> needed.
    </app-page-header>

    <div class="layout">
      <nav aria-label="Features">
        @for (feature of features; track feature.slug) {
          <a [routerLink]="feature.slug" routerLinkActive="active" ariaCurrentWhenActive="page">
            <app-icon [name]="feature.icon" [size]="16" />
            {{ feature.title }}
          </a>
        }
        <a routerLink="does-not-exist" routerLinkActive="active">
          <app-icon name="close" [size]="16" />
          Unknown slug
        </a>
      </nav>
      <section class="outlet">
        <router-outlet />
      </section>
    </div>
  `,
  styleUrl: './router-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouterDemo {
  protected readonly features = FEATURES;
}
