import {ChangeDetectionStrategy, Component} from '@angular/core';
import {Card} from '../../ui/card';
import {Icon} from '../../ui/icon';

@Component({
  selector: 'app-pick-feature',
  imports: [Card, Icon],
  template: `
    <app-card>
      <div class="empty">
        <app-icon name="route" [size]="32" />
        <p>Pick a feature on the left. The URL changes, and the detail view gets the slug as an input.</p>
      </div>
    </app-card>
  `,
  styles: `
    .empty { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 2.5rem 1rem; text-align: center; color: var(--text-faint); }
    p { max-width: 40ch; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PickFeature {}
