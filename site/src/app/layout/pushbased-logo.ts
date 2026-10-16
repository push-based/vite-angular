import {ChangeDetectionStrategy, Component} from '@angular/core';
import {PUSHBASED_LOGO} from './pushbased-logo-paths';

/** The PushBased logo, inline so its purple turns light in the dark theme (`--pushbased-navy`). */
@Component({
  selector: 'app-pushbased-logo',
  template: `
    <svg [attr.viewBox]="logo.viewBox" height="32" width="86" role="img" aria-label="PushBased">
      <path class="pushbased-navy" [attr.d]="logo.markTop" />
      <path fill="#FF003C" [attr.d]="logo.markBottom" />
      <path class="pushbased-navy" [attr.d]="logo.wordmark" />
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PushbasedLogo {
  protected readonly logo = PUSHBASED_LOGO;
}
