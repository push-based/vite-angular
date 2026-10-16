import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {RouterLink} from '@angular/router';
import {FEATURES} from '../../core/features';
import {Card} from '../../ui/card';
import {Icon} from '../../ui/icon';

@Component({
  selector: 'app-feature-detail',
  imports: [Card, Icon, RouterLink],
  templateUrl: './feature-detail.html',
  styleUrl: './feature-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureDetail {
  /** Bound from the `:slug` route parameter by withComponentInputBinding(). */
  readonly slug = input.required<string>();

  protected readonly index = computed(() => FEATURES.findIndex((f) => f.slug === this.slug()));
  protected readonly feature = computed(() => FEATURES[this.index()]);
  protected readonly previous = computed(() => FEATURES[(this.index() - 1 + FEATURES.length) % FEATURES.length]);
  protected readonly next = computed(() => FEATURES[(this.index() + 1) % FEATURES.length]);
}
