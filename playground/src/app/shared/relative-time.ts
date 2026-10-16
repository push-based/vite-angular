import {Pipe, type PipeTransform} from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1_000],
];

/** "3 minutes ago". A pure pipe: it reruns only when its inputs change. */
@Pipe({name: 'relativeTime'})
export class RelativeTimePipe implements PipeTransform {
  private readonly format = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});

  transform(value: Date | number, now: number = Date.now()): string {
    const diff = new Date(value).getTime() - now;
    for (const [unit, ms] of UNITS) {
      if (Math.abs(diff) >= ms || unit === 'second') {
        return this.format.format(Math.round(diff / ms), unit);
      }
    }
    return '';
  }
}
