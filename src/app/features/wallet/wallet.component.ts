import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserWallet, WalletTransaction } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { WalletService } from '@core/services/wallet.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-wallet-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.css'
})
export class WalletPageComponent implements OnInit {
  readonly wallet = signal<UserWallet | null>(null);
  readonly loading = signal(false);
  readonly topUpBusy = signal(false);
  readonly topUpAmount = signal(100);
  readonly loadError = signal('');
  readonly presetAmounts = [50, 100, 200, 500, 1000];

  readonly transactions = computed(() => {
    return [...(this.wallet()?.transactions || [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });

  constructor(
    readonly auth: AuthService,
    private readonly walletService: WalletService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadWallet();
    this.checkReturnFromPaymob();
  }

  refresh(): void {
    this.loadWallet();
  }

  setAmount(amount: number): void {
    this.topUpAmount.set(amount);
  }

  transactionIcon(transaction: WalletTransaction): string {
    return transaction.type === 'debit' ? 'fa-arrow-down' : 'fa-arrow-up';
  }

  topUpWithPaymob(): void {
    const amount = Number(this.topUpAmount());
    if (!Number.isFinite(amount) || amount < 5) {
      this.toast.show('Enter an amount of at least 5 EGP.', 'error');
      return;
    }

    this.topUpBusy.set(true);
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.initiatePaymobTopUp(token, amount) : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryInitiateAfterAuthError(error, amount))
    ).subscribe({
      next: (response) => {
        this.toast.show('Connecting to Paymob secure checkout...');
        window.location.href = response.checkoutUrl;
      },
      error: (err) => {
        this.topUpBusy.set(false);
        const msg = err?.error?.message || err?.error?.detail || 'Could not reach Paymob checkout. Please try again.';
        this.toast.show(msg, 'error');
      }
    });
  }

  private checkReturnFromPaymob(): void {
    const params = this.route.snapshot.queryParamMap;
    const topUpId = params.get('topUpId');
    const success = params.get('success');
    const transactionId = params.get('id') || undefined;

    if (!topUpId) return;

    if (success === 'false') {
      this.toast.show('Card payment was cancelled or failed.', 'error');
      this.clearQueryParams();
      return;
    }

    this.loading.set(true);
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.confirmPaymobTopUp(token, topUpId, transactionId) : throwError(() => new Error('No access token')))
    ).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'paid' && res.wallet) {
          this.wallet.set(res.wallet);
          this.toast.show('Wallet topped up successfully via Visa!');
        } else {
          this.loadWallet();
        }
        this.clearQueryParams();
      },
      error: () => {
        this.loading.set(false);
        this.loadWallet();
        this.clearQueryParams();
      }
    });
  }

  private clearQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true
    });
  }

  private loadWallet(): void {
    if (!this.auth.currentUser()) return;

    this.loading.set(true);
    this.loadError.set('');
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.getCurrentWallet(token) : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryLoadAfterAuthError(error))
    ).subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load your wallet right now. Try logging out and back in if this keeps happening.');
      }
    });
  }

  private retryLoadAfterAuthError(error: unknown) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.walletService.getCurrentWallet(token) : throwError(() => error))
    );
  }

  private retryInitiateAfterAuthError(error: unknown, amount: number) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.walletService.initiatePaymobTopUp(token, amount) : throwError(() => error))
    );
  }
}
