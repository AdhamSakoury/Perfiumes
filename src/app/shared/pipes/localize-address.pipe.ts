import { Pipe, PipeTransform } from '@angular/core';
import { LocalizationService } from '@core/services/localization.service';
import { translateAddress } from '@core/utils/address-translator.util';

@Pipe({
  name: 'localizeAddress',
  standalone: true,
  pure: false
})
export class LocalizeAddressPipe implements PipeTransform {
  constructor(private readonly i18n: LocalizationService) {}

  transform(address: string | null | undefined): string {
    if (!address) return '';
    return translateAddress(address, this.i18n.language());
  }
}
