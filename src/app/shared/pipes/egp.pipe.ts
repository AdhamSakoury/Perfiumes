import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number as Egyptian Pound with the number first:
 *   3500     → "3,500 EGP"
 *   3500.50  → "3,500.50 EGP"
 * Usage: {{ price | egp }}  or  {{ price | egp:2 }}
 */
@Pipe({
  name: 'egp',
  standalone: true
})
export class EgpPipe implements PipeTransform {
  transform(value: number | null | undefined, minDecimals = 0, maxDecimals = 0): string {
    if (value == null || isNaN(value)) return '0 EGP';
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals
    });
    return `${formatted} EGP`;
  }
}
