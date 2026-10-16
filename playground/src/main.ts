// Angular's own packages ship partially compiled (ɵɵngDeclare*). Until the plugin has a linker,
// loading the JIT compiler lets the runtime finish compiling them in the browser.
import '@angular/compiler';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {App} from './app/app';
import {routes} from './app/routes';

bootstrapApplication(App, {providers: [provideRouter(routes)]}).catch((err) => console.error(err));
