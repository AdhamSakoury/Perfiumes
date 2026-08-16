import { Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { environment } from '../../../../environments/environment';

const GOOGLE_AUTH_STATE_KEY = 'gnouby_google_auth_state';

@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './google-sign-in-button.component.html',
  styleUrl: './google-sign-in-button.component.css'
})
export class GoogleSignInButtonComponent {
  @Input() mode: 'signin' | 'signup' = 'signin';
  @Input() remember = true;
  @Input() fallbackUrl = '/account';

  configured = environment.googleClientId !== 'PASTE_GOOGLE_CLIENT_ID_HERE';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {}

  startGoogleSignIn(): void {
    if (!this.configured) {
      this.toast.show(this.i18n.t('googleClientIdMissing'));
      return;
    }

    const state = this.randomToken();
    const nonce = this.randomToken();
    const redirect = this.route.snapshot.queryParamMap.get('redirect') || this.fallbackUrl;
    sessionStorage.setItem(GOOGLE_AUTH_STATE_KEY, JSON.stringify({ state, nonce, redirect, remember: this.remember }));

    const params = new URLSearchParams({
      client_id: environment.googleClientId,
      redirect_uri: `${window.location.origin}/google-callback`,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce,
      state,
      prompt: 'select_account'
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  buttonLabelKey(): string {
    return this.mode === 'signup' ? 'signUpWithGoogle' : 'continueWithGoogle';
  }

  private randomToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

export { GOOGLE_AUTH_STATE_KEY };
