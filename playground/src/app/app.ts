import {ChangeDetectionStrategy, Component, LOCALE_ID, VERSION, inject, signal} from '@angular/core';
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
  /** The locale this copy of the app was built or served for, from `$localize.locale`. */
  protected readonly locale = inject(LOCALE_ID);
  /** A build has one folder per locale, so switching is a link. The dev server serves one locale. */
  protected readonly localized = !import.meta.env.DEV;
  protected readonly locales = [
    {code: 'en-US', label: 'English'},
    {code: 'de', label: 'Deutsch'},
  ];
  protected readonly themes: {value: Theme; icon: IconName; label: string}[] = [
    {value: 'light', icon: 'sun', label: $localize`:Color theme:Light`},
    {value: 'system', icon: 'monitor', label: $localize`:Color theme:System`},
    {value: 'dark', icon: 'moon', label: $localize`:Color theme:Dark`},
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
