import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { GoogleSignInButtonComponent } from '../google-sign-in-button/google-sign-in-button.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, GoogleSignInButtonComponent, RouterLink, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginPageComponent {
  email = '';
  password = '';
  remember = true;
  showPassword = false;
  loading = false;
  errors: { email?: string; password?: string } = {};

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toast: ToastService,
    readonly i18n: LocalizationService
  ) {
    const user = this.auth.currentUser();
    if (user) {
      void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') || (user.role === 'admin' ? '/admin' : '/account'));
    }

    const status = this.route.snapshot.queryParamMap.get('status');
    if (status === 'registered') this.toast.show(this.i18n.t('activationEmailSent'));
    if (status === 'activated') this.toast.show(this.i18n.t('accountActivated'));
    if (status === 'activation-failed') this.toast.show(this.i18n.t('accountActivationFailed'), 'error');
  }

  toggleLanguage(): void {
    this.i18n.setLanguage(this.i18n.language() === 'ar' ? 'en' : 'ar');
  }

  submit(): void {
    this.errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) this.errors.email = this.i18n.t('validEmailError');
    if (this.password.length < 6) this.errors.password = this.i18n.t('passwordMinSixError');
    if (Object.keys(this.errors).length) return;

    this.loading = true;
    this.auth.login(this.email, this.password, this.remember).subscribe({
      next: (result) => {
        this.loading = false;
        if (!result.success) {
          this.errors.email = result.message;
          return;
        }

        const fallback = result.user?.role === 'admin' ? '/admin' : '/account';
        void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') || fallback);
      },
      error: (error) => {
        this.loading = false;
        this.errors.email = error?.error?.message || this.i18n.t('invalidEmailOrPassword');
      }
    });
  }
}

