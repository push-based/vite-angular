import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {RouterLink} from '@angular/router';
import {copyCodeOnClick} from '../layout/copy-code';
import {Logo} from '../layout/logo';
import {Seo} from '../layout/seo';
import snippet from '../../../content/_home-snippet.md';

@Component({
  selector: 'app-home',
  imports: [Logo, RouterLink],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly snippet = inject(DomSanitizer).bypassSecurityTrustHtml(snippet.html);
  protected readonly copyCode = copyCodeOnClick;

  constructor() {
    inject(Seo).set({
      title: 'vite-plugin-ngp: Angular on Vite, one module at a time',
      description:
        "A Vite plugin that compiles Angular one module at a time with ngp, Angular's Rust-and-TypeScript preprocessor. Vite owns the module graph; nothing compiles the whole program first.",
      path: '',
    });
  }

  protected readonly facts = [
    {value: '1.6 s', label: 'from starting the dev server to the first page of a 5,000-component app, where ng serve takes 28.4 s'},
    {value: '~110 ms', label: 'from saving a template to the update in the page, at any app size, where ng serve takes 1.8 s at 5,000 components'},
    {value: 'Identical', label: 'output, byte for byte, to a full ngp build of the same app'},
    {value: 'In place', label: 'template edits swap into the running component, so its state survives'},
  ];

  protected readonly steps = [
    {title: 'Vite asks for a module', body: 'The browser requests a .ts file, and Vite hands its code to the plugin.'},
    {title: 'ngp compiles that one file', body: "ngp's Rust analyzer answers for that file alone, and Angular's own template compiler generates its code."},
    {title: 'Vite does the rest', body: "The plugin returns TypeScript and a source map. Vite strips the types, and other plugins see ordinary modules."},
  ];
}
