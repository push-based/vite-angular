import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';

/**
 * Only ever loaded from a @defer block, so in a production build it lands in its own chunk.
 * Draws a smoothed area chart from a series of numbers.
 */
@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path [attr.d]="area()" [attr.fill]="'url(#' + gradientId + ')'" />
      <path [attr.d]="line()" class="line" />
    </svg>
    @if (end(); as end) {
      <!-- An HTML dot: the SVG stretches to fit, which would squash a <circle> into an ellipse. -->
      <span class="dot" [style.left.%]="(end.x / width) * 100" [style.top.%]="(end.y / height) * 100"></span>
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    svg { display: block; width: 100%; height: 140px; overflow: visible; }
    .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .dot { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border: 2.5px solid var(--accent); border-radius: 50%; background: var(--surface); box-sizing: border-box; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly label = input('Chart');
  protected readonly width = 300;
  protected readonly height = 100;
  protected readonly gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`;

  protected readonly points = computed(() => {
    const values = this.values();
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    return values.map((v, i) => ({
      x: (i / (values.length - 1)) * this.width,
      y: this.height - 8 - ((v - min) / span) * (this.height - 16),
    }));
  });

  protected readonly line = computed(() =>
    this.points()
      .map((p, i, all) => {
        if (i === 0) return `M${p.x},${p.y}`;
        const prev = all[i - 1];
        const cx = (prev.x + p.x) / 2;
        return `C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`;
      })
      .join(' '),
  );

  protected readonly end = computed(() => this.points().at(-1));

  protected readonly area = computed(() => `${this.line()} L${this.width},${this.height} L0,${this.height} Z`);
}
