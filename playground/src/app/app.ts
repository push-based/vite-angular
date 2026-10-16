import {ChangeDetectionStrategy, Component, VERSION, inject, signal} from '@angular/core';
import {NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {FEATURES} from './core/features';
import {ThemeService, type Theme} from './core/theme';
import {Icon, type IconName} from './ui/icon';
import {Toasts} from './ui/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icon, Toasts],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'[class.nav-open]': 'navOpen()'},
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly features = FEATURES;
  protected readonly version = VERSION.full;
  protected readonly mode = import.meta.env.MODE;
  protected readonly navOpen = signal(false);
  protected readonly themes: {value: Theme; icon: IconName; label: string}[] = [
    {value: 'light', icon: 'sun', label: 'Light'},
    {value: 'system', icon: 'monitor', label: 'System'},
    {value: 'dark', icon: 'moon', label: 'Dark'},
  ];

  constructor() {
    // Close the mobile drawer after every navigation.
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.navOpen.set(false);
      }
    });
  }
}
