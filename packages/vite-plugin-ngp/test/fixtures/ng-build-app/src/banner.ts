import {Component} from '@angular/core';
import {bannerTemplate} from './environments/environment';

// The template comes from the replaced file, so only an analyzer that reads the replacement
// compiles the right one.
@Component({
  selector: 'app-banner',
  template: bannerTemplate,
  styleUrl: './banner.css',
})
export class Banner {}
