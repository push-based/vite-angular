import {Component} from '@angular/core';
import {Greeting} from './greeting';

@Component({
  selector: 'app-root',
  imports: [Greeting],
  templateUrl: './app.html',
})
export class App {
  title = 'file changes';
}
