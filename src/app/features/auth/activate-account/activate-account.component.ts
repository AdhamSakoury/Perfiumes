import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-activate-account',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './activate-account.component.html',
  styleUrl: './activate-account.component.css'
})
export class ActivateAccountComponent implements OnInit, OnDestroy {
  loading = true;
  success = false;
  message = '';
  countdown = 3;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
    readonly i18n: LocalizationService
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.loading = false;
      this.success = false;
      this.message = this.i18n.t('accountActivationFailed');
      this.cdr.markForCheck();
      return;
    }

    this.auth.activateAccount(token).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = response.success;
        this.message = response.success
          ? this.i18n.t('accountActivated')
          : (response.message || this.i18n.t('accountActivationFailed'));

        if (this.success) {
          this.startRedirectTimer();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.success = false;
        this.message = this.i18n.t('accountActivationFailed');
        this.cdr.markForCheck();
      }
    });
  }

  private startRedirectTimer(): void {
    this.timer = setInterval(() => {
      this.countdown--;
      this.cdr.markForCheck();
      if (this.countdown <= 0) {
        this.clearTimer();
        void this.router.navigate(['/login'], { queryParams: { status: 'activated' } });
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }
}
