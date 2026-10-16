import {ChangeDetectionStrategy, Component, computed, signal} from '@angular/core';
import {Greeting} from './greeting';

@Component({
  selector: 'app-home',
  imports: [Greeting],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly count = signal(0);
  protected readonly doubled = computed(() => this.count() * 2);
  protected readonly names = ['Vite', 'ngp', 'Angular'];

  protected increment(): void {
    this.count.update((n) => n + 1);
  }
}
