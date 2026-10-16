import './styles.css';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions} from '@angular/router';
import {App} from './app/app';
import {routes} from './app/routes';

bootstrapApplication(App, {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({skipInitialTransition: true}),
      withInMemoryScrolling({scrollPositionRestoration: 'top', anchorScrolling: 'enabled'}),
    ),
  ],
}).catch((err) => console.error(err));
