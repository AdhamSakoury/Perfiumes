import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { GOOGLE_AUTH_STATE_KEY } from '../google-sign-in-button/google-sign-in-button.component';

interface GoogleAuthState {
  state: string;
  nonce: string;
  redirect: string;
  remember: boolean;
}

@Component({
  selector: 'app-google-callback',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './google-callback.component.html',
  styleUrl: './google-callback.component.css'
})
export class GoogleCallbackComponent implements OnInit {
  loading = true;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const credential = params.get('id_token');
    const returnedState = params.get('state');
    const storedState = this.readStoredState();

    if (!credential || !returnedState || !storedState || returnedState !== storedState.state) {
      this.fail(this.i18n.t('googleCallbackInvalid'));
      return;
    }

    this.auth.loginWithGoogle(credential, storedState.remember).subscribe({
      next: () => {
        sessionStorage.removeItem(GOOGLE_AUTH_STATE_KEY);
        this.loading = false;
        this.toast.show(this.i18n.t('googleLoginSuccess'));
        const user = this.auth.currentUser();
        const fallback = user?.role === 'admin' ? '/admin' : storedState.redirect || '/account';
        void this.router.navigateByUrl(fallback);
      },
      error: () => this.fail(this.i18n.t('googleLoginFailed'))
    });
  }

  private readStoredState(): GoogleAuthState | null {
    const value = sessionStorage.getItem(GOOGLE_AUTH_STATE_KEY);
    if (!value) return null;

    try {
      return JSON.parse(value) as GoogleAuthState;
    } catch {
      return null;
    }
  }

  private fail(message: string): void {
    sessionStorage.removeItem(GOOGLE_AUTH_STATE_KEY);
    this.loading = false;
    this.error = message;
    this.toast.show(message, 'error');
  }
}
