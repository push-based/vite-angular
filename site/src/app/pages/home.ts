import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {RouterLink} from '@angular/router';
import {Logo} from '../layout/logo';
import snippet from '../../../content/_home-snippet.md';

@Component({
  selector: 'app-home',
  imports: [Logo, RouterLink],
  templateUrl: './home.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly snippet = inject(DomSanitizer).bypassSecurityTrustHtml(snippet.html);

  protected readonly facts = [
    {value: '164 ms', label: 'to serve the first module of a 5,000-component app, with no whole-program compile first'},
    {value: '~4 ms', label: 'per one-file edit at 5,000 components: about 1 ms in the analyzer, 3 ms to regenerate'},
    {value: 'Identical', label: 'output, byte for byte, to a full ngp build of the same app'},
    {value: 'In place', label: 'template edits swap into the running component, so its state survives'},
  ];

  protected readonly steps = [
    {title: 'Vite asks for a module', body: 'The browser requests a .ts file, and Vite hands its code to the plugin.'},
    {title: 'ngp compiles that one file', body: "ngp's Rust analyzer answers for that file alone, and Angular's own template compiler generates its code."},
    {title: 'Vite does the rest', body: "The plugin returns TypeScript and a source map. Vite strips the types, and other plugins see ordinary modules."},
  ];
}
