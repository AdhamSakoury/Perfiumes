import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserWallet, WalletTransaction } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { WalletService } from '@core/services/wallet.service';
import { catchError, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-wallet-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.css'
})
export class WalletPageComponent implements OnInit {
  readonly wallet = signal<UserWallet | null>(null);
  readonly loading = signal(false);
  readonly topUpBusy = signal(false);
  readonly topUpAmount = signal(0);
  readonly loadError = signal('');
  readonly transactions = computed(() => {
    return [...(this.wallet()?.transactions || [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  });

  constructor(
    readonly auth: AuthService,
    private readonly walletService: WalletService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadWallet();
  }

  refresh(): void {
    this.loadWallet();
  }

  transactionIcon(transaction: WalletTransaction): string {
    return transaction.type === 'debit' ? 'fa-arrow-down' : 'fa-arrow-up';
  }

  addMoney(): void {
    const amount = Number(this.topUpAmount());
    if (!Number.isFinite(amount) || amount <= 0) {
      this.toast.show('Enter an amount greater than zero.', 'error');
      return;
    }

    this.topUpBusy.set(true);
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.topUpCurrentWallet(token, amount) : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryTopUpAfterAuthError(error, amount))
    ).subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.topUpAmount.set(0);
        this.topUpBusy.set(false);
        this.toast.show('Money added to your wallet.');
      },
      error: () => {
        this.topUpBusy.set(false);
        this.toast.show('Could not add money to your wallet.', 'error');
      }
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

  private retryTopUpAfterAuthError(error: unknown, amount: number) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.walletService.topUpCurrentWallet(token, amount) : throwError(() => error))
    );
  }
}
