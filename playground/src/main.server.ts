import {bootstrapApplication, type BootstrapContext} from '@angular/platform-browser';
import {renderApplication} from '@angular/platform-server';
import {App} from './app/app';
import {serverConfig} from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, serverConfig, context);

/**
 * Renders one page. vite-plugin-ngp calls this for every page request in dev, and server.mjs
 * calls the built copy in production. `document` is index.html, already transformed by Vite.
 */
export default function render(url: string, document: string): Promise<string> {
  return renderApplication(bootstrap, {url, document});
}
