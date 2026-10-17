// Super Productivity doesn't install marked-katex-extension. ngx-markdown imports it only when a
// markdown field turns KaTeX on, and angular.json lists it under externalDependencies so the CLI's
// dev build leaves the import alone. Vite pre-bundles ngx-markdown and has to resolve every
// import it finds, so this stub stands in and fails where the real import would: at the call.
export default function markedKatex() {
  throw new Error('marked-katex-extension is not installed');
}
