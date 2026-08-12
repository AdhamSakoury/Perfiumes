import { Pipe, PipeTransform } from '@angular/core';
import { LocalizationService } from '@core/services/localization.service';

@Pipe({
  name: 't',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly i18n: LocalizationService) {}

  transform(key: string, params?: Record<string, string | number>): string {
    let value = this.i18n.t(key);

    if (!params) {
      return value;
    }

    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replaceAll(`{${paramKey}}`, String(paramValue));
    }

    return value;
  }
}
