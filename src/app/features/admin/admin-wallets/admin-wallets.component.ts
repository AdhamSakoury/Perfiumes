import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminWallet } from '@core/models/store.models';
import { AdminDashboardService } from '@core/services/admin-dashboard.service';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
<<<<<<< HEAD
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
=======
import { TranslatePipe } from '@shared/pipes/translate.pipe';
>>>>>>> c82970e9d9c0ef81a7bb3e78cfa860c66875ff96
import { Observable, catchError, finalize, switchMap, throwError, timeout } from 'rxjs';

@Component({
  selector: 'app-admin-wallets',
  standalone: true,
<<<<<<< HEAD
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, CustomDropdownComponent],
=======
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, TranslatePipe],
>>>>>>> c82970e9d9c0ef81a7bb3e78cfa860c66875ff96
  templateUrl: './admin-wallets.component.html',
  styleUrl: './admin-wallets.component.css'
})
export class AdminWalletsComponent {
  readonly wallets = signal<AdminWallet[]>([]);
  readonly query = signal('');
  readonly filteredWallets = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) return this.wallets();
    return this.wallets().filter((wallet) => {
      return wallet.userName.toLowerCase().includes(query)
        || wallet.userEmail.toLowerCase().includes(query)
        || wallet.id.toLowerCase().includes(query);
    });
  });
  readonly totalBalance = computed(() => this.wallets().reduce((sum, wallet) => sum + wallet.balance, 0));
  readonly totalCredit = computed(() => this.wallets().reduce((sum, wallet) => sum + wallet.lifetimeCredit, 0));
  readonly totalDebit = computed(() => this.wallets().reduce((sum, wallet) => sum + wallet.lifetimeDebit, 0));

  walletDraft: Record<string, { amount: number; type: 'credit' | 'debit'; reason: string }> = {};
  loading = false;
  loadError = '';
  updatingWalletId: string | null = null;

  constructor(
    readonly auth: AuthService,
    private readonly dashboard: AdminDashboardService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/wallets' } });
      return;
    }

    this.load();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get walletTypeOptions(): CustomDropdownOption[] {
    return [
      { value: 'credit', label: 'Credit', icon: 'fa-arrow-up' },
      { value: 'debit', label: 'Debit', icon: 'fa-arrow-down' }
    ];
  }

  setWalletDraftType(walletId: string, type: string): void {
    this.walletDraft[walletId].type = type === 'debit' ? 'debit' : 'credit';
  }

  load(): void {
    if (!this.isAdmin || this.loading) return;

    this.loading = true;
    this.loadError = '';
    this.adminRequest((token) => this.dashboard.getWallets(token)).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (wallets) => this.applyWallets(wallets),
      error: () => {
        this.loadError = this.i18n.t('walletsLoadFailed');
      }
    });
  }

  adjustWallet(wallet: AdminWallet): void {
    const draft = this.walletDraft[wallet.id];
    if (!draft || draft.amount <= 0 || this.updatingWalletId) return;

    this.updatingWalletId = wallet.id;
    this.adminRequest((token) => this.dashboard.adjustWallet(wallet.id, Number(draft.amount), draft.type, draft.reason || this.i18n.t('adminAdjustment'), token)).pipe(
      finalize(() => {
        this.updatingWalletId = null;
      })
    ).subscribe({
      next: (updated) => {
        this.wallets.set(this.wallets().map((item) => item.id === updated.id ? updated : item));
        this.walletDraft[updated.id] = { amount: 0, type: 'credit', reason: '' };
        this.toast.show(this.i18n.t('walletUpdated'));
      },
      error: () => {
        this.toast.show(this.i18n.t('walletUpdateFailed'), 'error');
      }
    });
  }

  private applyWallets(wallets: AdminWallet[]): void {
    this.wallets.set(wallets);
    this.loadError = '';
    for (const wallet of wallets) this.ensureWalletDraft(wallet);
  }

  private ensureWalletDraft(wallet: AdminWallet): void {
    this.walletDraft[wallet.id] ||= { amount: 0, type: 'credit', reason: '' };
  }

  private adminRequest<T>(request: (token: string) => Observable<T>): Observable<T> {
    const currentToken = this.auth.currentAccessToken();
    if (currentToken) return request(currentToken).pipe(catchError((error) => this.retryWithFreshToken(error, request)));

    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => (token ? request(token) : throwError(() => new Error('No admin token'))))
    );
  }

  private retryWithFreshToken<T>(error: unknown, request: (token: string) => Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => (token ? request(token) : throwError(() => error)))
    );
  }
}
