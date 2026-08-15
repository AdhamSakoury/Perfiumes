import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminDashboardSummary, AdminWallet } from '@core/models/store.models';
import { AdminDashboardService } from '@core/services/admin-dashboard.service';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, of, switchMap, throwError, timeout } from 'rxjs';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
  summary: AdminDashboardSummary | null = null;
  loading = false;
  refreshing = false;
  loadError = '';
  walletDraft: Record<string, { amount: number; type: 'credit' | 'debit'; reason: string }> = {};
  updatingWalletId: string | null = null;
  private retriedWithFreshToken = false;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly auth: AuthService,
    private readonly dashboard: AdminDashboardService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin' } });
      return;
    }

    this.applySummary(this.localDemoSummary());
    this.load(false);
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get cards(): { label: string; value: string | number; icon: string; tone: string }[] {
    const summary = this.summary;
    if (!summary) return [];

    return [
      { label: 'Revenue', value: `$${summary.revenue.toFixed(2)}`, icon: 'fa-chart-line', tone: 'gold' },
      { label: 'Orders', value: summary.totalOrders, icon: 'fa-bag-shopping', tone: 'teal' },
      { label: 'Customers', value: summary.totalCustomers, icon: 'fa-users', tone: 'earth' },
      { label: 'Wallet balance', value: `${summary.walletBalance.toFixed(2)} EGP`, icon: 'fa-wallet', tone: 'green' },
      { label: 'Products', value: summary.totalProducts, icon: 'fa-boxes-stacked', tone: 'sand' },
      { label: 'Open support', value: summary.openSupportMessages, icon: 'fa-headset', tone: 'red' }
    ];
  }

  load(showRefreshState = true): void {
    this.startHardFallbackTimer();
    const token = this.auth.currentAccessToken();
    if (!this.isAdmin) return;

    this.retriedWithFreshToken = false;
    if (token) {
      this.loadWithToken(token, showRefreshState);
      return;
    }

    this.loading = true;
    if (showRefreshState) this.refreshing = true;
    this.loadError = '';
    let handedOffToSummaryLoad = false;
    this.auth.refreshAdminAccessToken().pipe(
      finalize(() => {
        if (handedOffToSummaryLoad) return;
        this.loading = false;
        if (showRefreshState) this.refreshing = false;
      })
    ).subscribe({
      next: (freshToken) => {
        if (freshToken) {
          handedOffToSummaryLoad = true;
          this.loadWithToken(freshToken, showRefreshState);
          return;
        }

        this.loadError = 'Please login again as admin.';
        this.toast.show(this.loadError, 'error');
      },
      error: () => {
        this.loadError = 'Please login again as admin.';
        this.toast.show(this.loadError, 'error');
      }
    });
  }

  private loadWithToken(token: string, showRefreshState = true): void {
    this.loading = true;
    if (showRefreshState) this.refreshing = true;
    this.loadError = '';
    this.dashboard.getSummary(token).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
        if (showRefreshState) this.refreshing = false;
      })
    ).subscribe({
      next: (summary) => this.applySummary(summary),
      error: (error: unknown) => this.handleLoadError(error, token, showRefreshState)
    });
  }

  private retryWithFreshToken(showRefreshState = true): void {
    this.loading = true;
    if (showRefreshState) this.refreshing = true;
    this.auth.refreshAdminAccessToken().pipe(
      switchMap((freshToken) => {
        if (!freshToken) return throwError(() => new Error('No fresh admin token'));
        return this.dashboard.getSummary(freshToken).pipe(timeout(10000));
      }),
      finalize(() => {
        this.loading = false;
        if (showRefreshState) this.refreshing = false;
      })
    ).subscribe({
      next: (summary) => this.applySummary(summary),
      error: (error: unknown) => {
        this.handleLoadError(error, null, showRefreshState);
      }
    });
  }

  private applySummary(summary: AdminDashboardSummary): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.summary = summary;
    this.loading = false;
    this.refreshing = false;
    this.loadError = '';
    this.retriedWithFreshToken = false;
    for (const wallet of summary.wallets) this.ensureWalletDraft(wallet);
  }

  private handleLoadError(error: unknown, attemptedToken: string | null, showRefreshState = true): void {
    if (attemptedToken && error instanceof HttpErrorResponse && error.status === 401 && !this.retriedWithFreshToken) {
      this.retriedWithFreshToken = true;
      this.retryWithFreshToken(showRefreshState);
      return;
    }

    this.loadError = error instanceof HttpErrorResponse && error.status === 0
      ? 'Backend is not reachable. Start Perfiumes.Api from Visual Studio, then try again.'
      : 'Could not load admin dashboard. Please refresh or login again as admin.';
    this.toast.show(this.loadError, 'error');
    this.loadDemoSummary();
  }

  adjustWallet(wallet: AdminWallet): void {
    const token = this.auth.currentAccessToken();
    const draft = this.walletDraft[wallet.id];
    if (!token || !draft || draft.amount <= 0 || this.updatingWalletId) return;

    this.updatingWalletId = wallet.id;
    this.dashboard.adjustWallet(wallet.id, Number(draft.amount), draft.type, draft.reason || 'Admin adjustment', token).pipe(
      finalize(() => {
        this.updatingWalletId = null;
      })
    ).subscribe({
      next: (updated) => {
        if (!this.summary) return;
        this.summary = {
          ...this.summary,
          walletBalance: this.summary.walletBalance - wallet.balance + updated.balance,
          wallets: this.summary.wallets.map((item) => item.id === updated.id ? updated : item)
        };
        this.walletDraft[wallet.id] = { amount: 0, type: 'credit', reason: '' };
        this.toast.show('Wallet updated.');
      },
      error: () => {
        this.toast.show('Could not update wallet.', 'error');
      }
    });
  }

  private ensureWalletDraft(wallet: AdminWallet): void {
    this.walletDraft[wallet.id] ||= { amount: 0, type: 'credit', reason: '' };
  }

  private startHardFallbackTimer(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => {
      if (!this.summary) this.loadDemoSummary();
    }, 3500);
  }

  private loadDemoSummary(): void {
    this.dashboard.getDemoSummary().pipe(
      timeout(5000),
      switchMap((summary) => of(summary))
    ).subscribe({
      next: (summary) => this.applySummary(summary),
      error: () => this.applySummary(this.localDemoSummary())
    });
  }

  private localDemoSummary(): AdminDashboardSummary {
    return {
      totalUsers: 14,
      totalCustomers: 13,
      totalProducts: 80,
      totalOrders: 7,
      openSupportMessages: 4,
      revenue: 1772.5,
      walletBalance: 2025,
      recentOrders: [
        { id: 'ORD-DEMO-1001', userEmail: 'mariam@test.local', status: 'Processing', total: 121.5, date: new Date().toISOString() },
        { id: 'ORD-DEMO-1002', userEmail: 'laila@test.local', status: 'Packed', total: 190, date: new Date().toISOString() },
        { id: 'ORD-DEMO-1003', userEmail: 'hana@test.local', status: 'Shipped', total: 405, date: new Date().toISOString() }
      ],
      wallets: [
        { id: 'demo-wallet-1', userId: 'test_customer_1', userName: 'Mariam Hassan', userEmail: 'mariam@test.local', balance: 450, lifetimeCredit: 450, lifetimeDebit: 0, currency: 'EGP', updatedAt: new Date().toISOString() },
        { id: 'demo-wallet-2', userId: 'test_customer_2', userName: 'Omar Saleh', userEmail: 'omar@test.local', balance: 225, lifetimeCredit: 225, lifetimeDebit: 0, currency: 'EGP', updatedAt: new Date().toISOString() },
        { id: 'demo-wallet-3', userId: 'test_customer_3', userName: 'Hana Mahmoud', userEmail: 'hana@test.local', balance: 375, lifetimeCredit: 375, lifetimeDebit: 0, currency: 'EGP', updatedAt: new Date().toISOString() }
      ]
    };
  }
}
