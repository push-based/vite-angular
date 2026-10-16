import {Directive, input, signal} from '@angular/core';

/** Tints its host while hovered or focused: host bindings and host listeners on a directive. */
@Directive({
  selector: '[appHighlight]',
  host: {
    '[style.background]': "active() ? appHighlight() : null",
    '[style.transition]': "'background 160ms ease'",
    '[attr.data-highlighted]': 'active()',
    '(mouseenter)': 'active.set(true)',
    '(mouseleave)': 'active.set(false)',
    '(focusin)': 'active.set(true)',
    '(focusout)': 'active.set(false)',
  },
})
export class Highlight {
  readonly appHighlight = input('var(--accent-soft)');
  protected readonly active = signal(false);
}
