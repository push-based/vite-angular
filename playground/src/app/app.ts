import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink, RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styles: `
    nav { display: flex; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #ccc; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
