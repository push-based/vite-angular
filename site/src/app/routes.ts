import type {Routes} from '@angular/router';
import {DOCS} from './docs';
import {DocPage} from './pages/doc-page';
import {Home} from './pages/home';
import {NotFound} from './pages/not-found';

export const routes: Routes = [
  {path: '', component: Home, title: 'vite-plugin-ngp: Angular on Vite, one module at a time'},
  ...DOCS.map((entry) => ({
    path: entry.path,
    component: DocPage,
    resolve: {doc: entry.load},
  })),
  {path: '**', component: NotFound, title: 'Page not found · vite-plugin-ngp'},
];
