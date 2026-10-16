import {ChangeDetectionStrategy, Component, ViewEncapsulation} from '@angular/core';

const TEMPLATE = `
  <div class="box">
    <strong class="mode"><ng-content /></strong>
    <p class="leaky">I have class <code>.leaky</code>.</p>
  </div>
`;

/** Default mode: styles are rewritten with _ngcontent attributes, so they stay inside. */
@Component({
  selector: 'app-enc-emulated',
  template: TEMPLATE,
  styleUrl: './encapsulation.emulated.css',
  encapsulation: ViewEncapsulation.Emulated,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncEmulated {}

/** No encapsulation: the stylesheet goes to <head> as written and applies to the whole page. */
@Component({
  selector: 'app-enc-none',
  template: TEMPLATE,
  styleUrl: './encapsulation.none.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncNone {}

/**
 * A real shadow root. Global stylesheets can't get in, but Angular copies the styles of the app's
 * other components into it, so a ViewEncapsulation.None rule still reaches it.
 */
@Component({
  selector: 'app-enc-shadow',
  template: TEMPLATE,
  styleUrl: './encapsulation.shadow.css',
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncShadow {}
