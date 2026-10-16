import type {IconName} from '../ui/icon';

/** One demo page: drives the sidebar, the overview grid and the router demo. */
export interface Feature {
  slug: string;
  path: string;
  title: string;
  icon: IconName;
  summary: string;
  covers: string[];
}

export const FEATURES: Feature[] = [
  {
    slug: 'signals',
    path: '/signals',
    title: 'Signals',
    icon: 'bolt',
    summary: 'Reactive state with signal, computed, linkedSignal and effect, driving a counter and a todo list.',
    covers: ['signal()', 'computed()', 'linkedSignal()', 'effect()', '@let'],
  },
  {
    slug: 'control-flow',
    path: '/control-flow',
    title: 'Control flow',
    icon: 'branch',
    summary: 'Built-in template blocks, including deferred views that load in their own chunk.',
    covers: ['@if', '@for', '@switch', '@defer', '@empty'],
  },
  {
    slug: 'components',
    path: '/components',
    title: 'Components',
    icon: 'blocks',
    summary: 'Inputs, outputs, two-way model(), content projection, directives, pipes and DI.',
    covers: ['input()', 'output()', 'model()', 'ng-content', 'host bindings', 'pipes'],
  },
  {
    slug: 'router',
    path: '/router',
    title: 'Router',
    icon: 'route',
    summary: 'Lazy routes, child routes and route parameters bound straight to component inputs.',
    covers: ['loadComponent', 'children', 'withComponentInputBinding', 'routerLinkActive'],
  },
  {
    slug: 'styles',
    path: '/styles',
    title: 'Styles',
    icon: 'palette',
    summary: 'External stylesheets and the three view-encapsulation modes, side by side.',
    covers: ['styleUrl', 'Emulated', 'None', 'ShadowDom', ':host'],
  },
];
