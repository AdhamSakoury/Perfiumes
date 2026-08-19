import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css'
})
export class ResetPasswordComponent {
  token = '';
  password = '';
  confirmPassword = '';
  error = '';
  loading = false;

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) this.error = this.i18n.t('resetTokenMissing');
  }

  submit(): void {
    this.error = '';
    if (!this.token) {
      this.error = this.i18n.t('resetTokenMissing');
      return;
    }

    if (this.password.length < 8 || this.password !== this.confirmPassword) {
      this.error = this.i18n.t('resetPasswordValidation');
      return;
    }

    this.loading = true;
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading = false;
        this.toast.show(this.i18n.t('passwordUpdated'));
        this.password = '';
        this.confirmPassword = '';
        void this.router.navigateByUrl('/account');
      },
      error: (error) => {
        this.loading = false;
        this.error = error?.error?.message || this.i18n.t('resetPasswordFailed');
      }
    });
  }
}

