import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <p class="code">404</p>
    <h1>No route here</h1>
    <p class="muted">The wildcard route caught this URL. It's lazy too.</p>
    <a class="btn btn-primary" routerLink="/">Back to the overview</a>
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 4rem 1rem; text-align: center; }
    .code { font-family: var(--mono); font-size: 4rem; font-weight: 800; background: var(--gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    a:hover { text-decoration: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {}
