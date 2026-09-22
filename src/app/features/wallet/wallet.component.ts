import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserWallet, WalletTransaction } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { WalletService, paymobConfirmPayloadFromParams } from '@core/services/wallet.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, of, switchMap, throwError } from 'rxjs';

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
    private readonly i18n: LocalizationService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadWallet();
    if (this.isPaymobWalletReturn()) {
      this.checkReturnFromPaymob();
    }
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
      this.toast.show(this.i18n.t('enterTopUpAmount'), 'error');
      return;
    }

    this.topUpBusy.set(true);
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.initiatePaymobTopUp(token, amount) : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryInitiateAfterAuthError(error, amount))
    ).subscribe({
      next: (response) => {
        sessionStorage.setItem('gnouby_pending_wallet_topup', JSON.stringify({
          id: response.topUpId,
          amount,
          at: Date.now()
        }));
        this.toast.show(this.i18n.t('connectingPaymob'));
        window.location.href = response.checkoutUrl;
      },
      error: (err) => {
        this.topUpBusy.set(false);
        const msg = err?.error?.message || err?.error?.detail || this.i18n.t('paymobUnavailable');
        this.toast.show(msg, 'error');
      }
    });
  }

  private isPaymobWalletReturn(): boolean {
    const params = this.route.snapshot.queryParamMap;
    const success = params.get('success');
    const transactionId = params.get('id');
    const topUpId = params.get('topUpId')
      || params.get('merchant_order_id')
      || params.get('special_reference')
      || '';
    return params.get('type') === 'wallet'
      || topUpId.startsWith('wtop_')
      || (!!transactionId && success !== null && !params.get('orderId'));
  }

  private checkReturnFromPaymob(): void {
    const params = this.route.snapshot.queryParamMap;
    const payload = paymobConfirmPayloadFromParams(params);
    const storedTopUpId = this.readStoredTopUpId();
    if (storedTopUpId && (!payload.topUpId || !payload.topUpId.startsWith('wtop_'))) {
      payload.topUpId = storedTopUpId;
    }

    if (payload.success === false) {
      this.toast.show(this.i18n.t('cardPaymentCancelled'), 'error');
      this.clearQueryParams();
      return;
    }

    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token
        ? this.walletService.confirmPaymobTopUpReturn(token, payload)
        : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryConfirmAfterAuthError(error, payload))
    ).subscribe({
      next: (res) => {
        if (res.status === 'paid' && res.wallet) {
          this.wallet.set(res.wallet);
          this.loading.set(false);
          sessionStorage.removeItem('gnouby_pending_wallet_topup');
          this.toast.show(this.i18n.t('walletTopUpVisaSuccess'));
        } else if (res.status === 'failed') {
          sessionStorage.removeItem('gnouby_pending_wallet_topup');
          this.toast.show(this.i18n.t('cardPaymentCancelled'), 'error');
          this.loadWallet();
        } else {
          this.loadWallet();
        }
        this.clearQueryParams();
      },
      error: () => {
        this.loadWallet();
        this.clearQueryParams();
      }
    });
  }

  private readStoredTopUpId(): string | undefined {
    try {
      const raw = sessionStorage.getItem('gnouby_pending_wallet_topup');
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { id?: string; at?: number };
      if (!parsed.id?.startsWith('wtop_')) return undefined;
      if (parsed.at && Date.now() - parsed.at > 2 * 60 * 60 * 1000) return undefined;
      return parsed.id;
    } catch {
      return undefined;
    }
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
        this.loadError.set(this.i18n.t('walletLoadFailed'));
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

  private retryConfirmAfterAuthError(error: unknown, payload: ReturnType<typeof paymobConfirmPayloadFromParams>) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.walletService.confirmPaymobTopUpReturn(token, payload) : throwError(() => error))
    );
  }
}
