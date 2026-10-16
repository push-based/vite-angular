import {ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, linkedSignal, signal} from '@angular/core';
import {RelativeTimePipe} from '../../shared/relative-time';
import {Card} from '../../ui/card';
import {Icon} from '../../ui/icon';
import {PageHeader} from '../../ui/page-header';

interface Todo {
  id: number;
  title: string;
  done: boolean;
  created: number;
}

type Filter = 'all' | 'active' | 'done';

@Component({
  selector: 'app-signals',
  imports: [Card, Icon, PageHeader, RelativeTimePipe],
  templateUrl: './signals.html',
  styleUrl: './signals.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Signals {
  // Counter
  protected readonly count = signal(0);
  protected readonly step = signal(1);
  protected readonly doubled = computed(() => this.count() * 2);
  protected readonly parity = computed(() => (this.count() % 2 === 0 ? 'even' : 'odd'));
  protected readonly log = signal<string[]>([]);

  // Todos
  private nextId = 4;
  protected readonly draft = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly todos = signal<Todo[]>([
    {id: 1, title: 'Compile a component with ngp', done: true, created: Date.now() - 3_600_000},
    {id: 2, title: 'Edit a template and watch HMR', done: false, created: Date.now() - 600_000},
    {id: 3, title: 'Open a deferred block', done: false, created: Date.now() - 45_000},
  ]);
  protected readonly visible = computed(() => {
    const filter = this.filter();
    return this.todos().filter((t) => filter === 'all' || (filter === 'done') === t.done);
  });
  protected readonly remaining = computed(() => this.todos().filter((t) => !t.done).length);
  /** Follows the list: resets to the first visible todo whenever the filter changes what's shown. */
  protected readonly selected = linkedSignal<Todo[], number | null>({
    source: this.visible,
    computation: (visible, previous) =>
      visible.some((t) => t.id === previous?.value) ? previous!.value : (visible[0]?.id ?? null),
  });
  protected readonly filters: Filter[] = ['all', 'active', 'done'];
  protected readonly now = signal(Date.now());

  constructor() {
    effect(() => {
      const count = this.count();
      this.log.update((log) => [`count → ${count} (${this.parity()})`, ...log].slice(0, 5));
    });
    // Keep "x minutes ago" fresh without zone.js: a signal tick every 15 s.
    const timer = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected add(): void {
    const title = this.draft().trim();
    if (!title) {
      return;
    }
    this.todos.update((list) => [...list, {id: this.nextId++, title, done: false, created: Date.now()}]);
    this.draft.set('');
    this.now.set(Date.now());
  }

  protected toggle(id: number): void {
    this.todos.update((list) => list.map((t) => (t.id === id ? {...t, done: !t.done} : t)));
  }

  protected remove(id: number): void {
    this.todos.update((list) => list.filter((t) => t.id !== id));
  }

  protected clearDone(): void {
    this.todos.update((list) => list.filter((t) => !t.done));
  }
}
