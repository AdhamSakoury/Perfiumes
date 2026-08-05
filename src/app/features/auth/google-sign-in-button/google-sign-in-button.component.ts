import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { environment } from '../../../../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleInitializeConfig) => void;
          renderButton: (element: HTMLElement, options: GoogleButtonOptions) => void;
          cancel: () => void;
        };
      };
    };
  }
}

interface GoogleInitializeConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleButtonOptions {
  type: 'standard';
  theme: 'outline' | 'filled_blue' | 'filled_black';
  size: 'large' | 'medium' | 'small';
  text: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape: 'rectangular' | 'pill' | 'circle' | 'square';
  width: number;
}

@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  templateUrl: './google-sign-in-button.component.html',
  styleUrl: './google-sign-in-button.component.css'
})
export class GoogleSignInButtonComponent implements AfterViewInit, OnDestroy {
  @ViewChild('googleButton', { static: true }) private readonly googleButton?: ElementRef<HTMLDivElement>;

  loading = false;
  configured = environment.googleClientId !== 'PASTE_GOOGLE_CLIENT_ID_HERE';

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    if (!this.configured) {
      return;
    }

    this.loadGoogleScript()
      .then(() => this.renderGoogleButton())
      .catch(() => this.toast.show('Could not load Google sign-in. Please try again.'));
  }

  ngOnDestroy(): void {
    window.google?.accounts.id.cancel();
  }

  startGoogleSignIn(): void {
    if (!this.configured) {
      this.toast.show('Add your Google Client ID first to enable Google login.');
      return;
    }

    this.toast.show('Google login is loading. If the button does not appear, refresh the page.');
  }

  private renderGoogleButton(): void {
    const element = this.googleButton?.nativeElement;
    if (!element || !window.google) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => this.zone.run(() => this.handleCredential(response))
    });

    window.google.accounts.id.renderButton(element, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 360
    });
  }

  private handleCredential(response: GoogleCredentialResponse): void {
    if (!response.credential) {
      this.toast.show('Google did not return a login credential.');
      return;
    }

    this.loading = true;
    this.auth.loginWithGoogle(response.credential).subscribe({
      next: () => {
        this.loading = false;
        this.toast.show('Signed in with Google successfully.');
        void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') || '/account');
      },
      error: () => {
        this.loading = false;
        this.toast.show('Google login failed. Check the backend Client ID setting.');
      }
    });
  }

  private loadGoogleScript(): Promise<void> {
    if (window.google?.accounts?.id) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.head.appendChild(script);
    });
  }
}

