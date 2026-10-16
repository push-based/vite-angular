import {provideZoneChangeDetection, type ApplicationConfig} from '@angular/core';

// A zone.js app, like every app made before Angular 21: change detection runs when zone.js says
// a task finished, not when a signal changes.
export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection()],
};
