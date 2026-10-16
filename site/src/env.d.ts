/** The path the site is served from, such as `/vite-angular/`. Defined in vite.config.ts. */
declare const SITE_BASE: string;

/** The site's absolute URL, such as `https://push-based.github.io/vite-angular/`. */
declare const SITE_URL: string;

/** What the site was built from: this repo's commit, and the Angular release and commit ngp is built at. */
declare const SITE_BUILD: {commit: string; angular: string; ngpCommit: string};

declare module '*.md' {
  const doc: import('./app/docs').Doc;
  export default doc;
}
