import {ChangeDetectionStrategy, Component, computed, signal} from '@angular/core';
import {Card} from '../../ui/card';
import {Icon} from '../../ui/icon';
import {PageHeader} from '../../ui/page-header';
import {Sparkline} from './sparkline';

type Tab = 'build' | 'serve' | 'test';

interface Framework {
  name: string;
  stars: number;
}

@Component({
  selector: 'app-control-flow',
  imports: [Card, Icon, PageHeader, Sparkline],
  templateUrl: './control-flow.html',
  styleUrl: './control-flow.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControlFlow {
  // @if
  protected readonly temperature = signal(21);

  // @switch
  protected readonly tab = signal<Tab>('serve');
  protected readonly tabs: Tab[] = ['build', 'serve', 'test'];

  // @for
  private readonly all: Framework[] = [
    {name: 'Angular', stars: 98},
    {name: 'Vite', stars: 74},
    {name: 'Rolldown', stars: 12},
    {name: 'oxc', stars: 15},
    {name: 'TypeScript', stars: 104},
  ];
  protected readonly items = signal<Framework[]>(this.all);
  protected readonly total = computed(() => this.items().reduce((sum, f) => sum + f.stars, 0));

  // @defer
  protected readonly series = signal(randomSeries());

  protected shuffle(): void {
    this.items.update((list) => [...list].sort(() => Math.random() - 0.5));
  }

  protected sort(): void {
    this.items.update((list) => [...list].sort((a, b) => b.stars - a.stars));
  }

  protected clear(): void {
    this.items.set([]);
  }

  protected reset(): void {
    this.items.set(this.all);
  }

  protected reroll(): void {
    this.series.set(randomSeries());
  }
}

function randomSeries(): number[] {
  let v = 40;
  return Array.from({length: 24}, () => (v = Math.max(5, v + (Math.random() - 0.45) * 18)));
}
