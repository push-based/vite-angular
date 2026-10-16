import type {ApplicationConfig} from '@angular/core';
import {provideClientHydration, withEventReplay} from '@angular/platform-browser';
import {provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions} from '@angular/router';
import {routes} from './routes';

/** Providers shared by the browser (main.ts) and the server (main.server.ts). */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      // The first navigation runs while hydration takes over the server's DOM; a view transition
      // there aborts with InvalidStateError.
      withViewTransitions({skipInitialTransition: true}),
      withInMemoryScrolling({scrollPositionRestoration: 'top', anchorScrolling: 'enabled'}),
    ),
    // The browser takes over the server-rendered DOM instead of rendering it again, and replays
    // clicks that happen before it has.
    provideClientHydration(withEventReplay()),
  ],
};
