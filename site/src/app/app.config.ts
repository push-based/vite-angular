import type {ApplicationConfig} from '@angular/core';
import {provideClientHydration, withEventReplay} from '@angular/platform-browser';
import {provideRouter, withComponentInputBinding, withInMemoryScrolling} from '@angular/router';
import {routes} from './routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({anchorScrolling: 'enabled', scrollPositionRestoration: 'top'}),
    ),
    provideClientHydration(withEventReplay()),
  ],
};
