import {ChangeDetectionStrategy, Component} from '@angular/core';
import {Card} from '../../ui/card';
import {PageHeader} from '../../ui/page-header';
import {EncEmulated, EncNone, EncShadow} from './encapsulation';
import {ScssMeter} from './scss-meter';

@Component({
  selector: 'app-styles-demo',
  imports: [Card, PageHeader, EncEmulated, EncNone, EncShadow, ScssMeter],
  templateUrl: './styles-demo.html',
  styleUrl: './styles-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StylesDemo {}
