import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css'
})
export class ForgotPasswordComponent {
  email = '';
  resetLink = '';
  loading = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  submit(): void {
    this.error = '';
    this.resetLink = '';
    const email = this.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error = this.i18n.t('validEmailError');
      return;
    }

    this.loading = true;
    this.auth.forgotPassword(email).subscribe({
      next: (response) => {
        this.loading = false;
        this.toast.show(this.i18n.t('passwordResetPrepared').replace('{email}', email));
        this.email = '';
        this.resetLink = response.resetUrl || '';
      },
      error: (error) => {
        this.loading = false;
        this.error = error?.error?.message || this.i18n.t('passwordResetFailed');
      }
    });
  }

  openResetLink(): void {
    if (!this.resetLink) return;

    const url = new URL(this.resetLink);
    const token = url.searchParams.get('token');
    void this.router.navigate(['/reset-password'], { queryParams: token ? { token } : undefined });
  }
}

