import type {Routes} from '@angular/router';
import {Overview} from './pages/overview/overview';

/** Every page but the overview is lazy, so each one is a separate module ngp compiles on request. */
export const routes: Routes = [
  {path: '', component: Overview, title: 'Overview · ngp playground'},
  {
    path: 'signals',
    title: 'Signals · ngp playground',
    loadComponent: () => import('./pages/signals/signals').then((m) => m.Signals),
  },
  {
    path: 'control-flow',
    title: 'Control flow · ngp playground',
    loadComponent: () => import('./pages/control-flow/control-flow').then((m) => m.ControlFlow),
  },
  {
    path: 'components',
    title: 'Components · ngp playground',
    loadComponent: () => import('./pages/components/components').then((m) => m.Components),
  },
  {
    path: 'router',
    title: 'Router · ngp playground',
    loadComponent: () => import('./pages/router/router-demo').then((m) => m.RouterDemo),
    children: [
      {path: '', loadComponent: () => import('./pages/router/pick-feature').then((m) => m.PickFeature)},
      {path: ':slug', loadComponent: () => import('./pages/router/feature-detail').then((m) => m.FeatureDetail)},
    ],
  },
  {
    path: 'styles',
    title: 'Styles · ngp playground',
    loadComponent: () => import('./pages/styles/styles-demo').then((m) => m.StylesDemo),
  },
  {
    path: '**',
    title: 'Not found · ngp playground',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
