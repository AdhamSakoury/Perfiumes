import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-resend-confirmation',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './resend-confirmation.component.html',
  styleUrl: './resend-confirmation.component.css'
})
export class ResendConfirmationComponent {
  email = '';
  error = '';
  loading = false;
  devActivationUrl = '';

  constructor(
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  resend(): void {
    const email = this.email.trim().replace('\\@', '@');
    this.error = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error = this.i18n.t('validEmailError');
      return;
    }

    this.loading = true;
    this.devActivationUrl = '';
    this.auth.resendConfirmation(email).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.emailSent) {
          this.email = '';
          this.toast.show(this.i18n.t('confirmationPrepared').replace('{email}', email));
          return;
        }

        if (response.devActivationUrl) {
          this.devActivationUrl = response.devActivationUrl;
          this.toast.show(this.i18n.t('activationDevFallback'));
          return;
        }

        this.error = response.message || this.i18n.t('activationEmailFailed');
        this.toast.show(this.error, 'error');
      },
      error: (error) => {
        this.loading = false;
        this.error = error?.error?.message || error?.error?.title || 'Failed to send confirmation email';
      }
    });
  }
}

