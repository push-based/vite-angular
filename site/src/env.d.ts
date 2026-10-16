/** The path the site is served from, such as `/vite-angular/`. Defined in vite.config.ts. */
declare const SITE_BASE: string;

declare module '*.md' {
  const doc: import('./app/docs').Doc;
  export default doc;
}
