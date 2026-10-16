import {ChangeDetectionStrategy, Component, input} from '@angular/core';

/**
 * A surface with three projection slots: `[card-title]`, the default slot, and `[card-footer]`.
 * Every demo sits in one, so content projection is exercised on every page.
 */
@Component({
  selector: 'app-card',
  templateUrl: './card.html',
  styleUrl: './card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'[class.flush]': 'flush()'},
})
export class Card {
  /** Drop the body padding, for content that runs edge to edge. */
  readonly flush = input(false);
  readonly eyebrow = input<string>();
}
