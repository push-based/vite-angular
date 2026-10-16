import {mergeApplicationConfig} from '@angular/core';
import {bootstrapApplication, type BootstrapContext} from '@angular/platform-browser';
import {INITIAL_CONFIG, platformServer, provideServerRendering, renderApplication} from '@angular/platform-server';
import {App} from './app';
import {appConfig} from './app.config';

const serverConfig = mergeApplicationConfig(appConfig, {providers: [provideServerRendering()]});
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, serverConfig, context);

export default function render(url: string, document: string): Promise<string> {
  return renderApplication(bootstrap, {url, document});
}

/**
 * Boots the app, waits for the root component's async `load()`, and returns the zone the code
 * after its `await` ran in: `angular` when zone.js tracked it, `<root>` when it escaped.
 */
export async function zoneAfterAwait(url: string, document: string): Promise<string> {
  const platformRef = platformServer([{provide: INITIAL_CONFIG, useValue: {document, url}}]);
  try {
    const appRef = await bootstrap({platformRef});
    const app = appRef.components[0].instance as App;
    await app.loading;
    return app.zoneAfterAwait;
  } finally {
    platformRef.destroy();
  }
}
