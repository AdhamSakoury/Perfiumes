import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-otp-verify',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './otp-verify.component.html',
  styleUrl: './otp-verify.component.css'
})
export class OtpVerifyComponent {
  code = '';

  constructor(private readonly toast: ToastService, private readonly i18n: LocalizationService) {}

  verify(): void {
    this.toast.show(this.code.length >= 4 ? this.i18n.t('otpVerified') : this.i18n.t('otpInvalid'), this.code.length >= 4 ? 'success' : 'error');
  }
}

