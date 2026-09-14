import { EgpPipe } from '@shared/pipes/egp.pipe';
import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, Inject, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User, UserWallet } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { ToastService } from '@core/services/toast.service';
import { WishlistService } from '@core/services/wishlist.service';
import { WalletService } from '@core/services/wallet.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [EgpPipe, CurrencyPipe, DatePipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css'
})
export class AccountPageComponent implements OnInit {
  editOpen = false;
  orderHistoryOpen = false;
  readonly wallet = signal<UserWallet | null>(null);
  readonly walletLoading = signal(false);
  readonly recentOrders = computed(() => (this.auth.currentUser()?.orders || []).slice(0, 3));
  form = this.emptyForm();
  passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  private modalLockActive = false;

  constructor(
    readonly auth: AuthService,
    readonly wishlist: WishlistService,
    private readonly walletService: WalletService,
    private readonly cart: CartService,
    readonly toast: ToastService,
    private readonly scrollLock: ScrollLockService,
    private readonly i18n: LocalizationService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

  ngOnInit(): void {
    this.loadWallet();
  }

  initials(user: User): string {
    return user.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U';
  }

  firstName(name: string): string {
    return name.split(' ')[0] || name;
  }

  @HostListener('document:keydown.escape')
  closePopups(): void {
    this.editOpen = false;
    this.orderHistoryOpen = false;
    this.setPopupToggle('account-edit-toggle', false);
    this.setPopupToggle('account-order-toggle', false);
    this.syncScrollLock();
  }

  openEdit(user: User): void {
    this.form = {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      address: user.address || ''
    };
    this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.orderHistoryOpen = false;
    this.editOpen = true;
    this.setPopupToggle('account-edit-toggle', true);
    this.setPopupToggle('account-order-toggle', false);
    this.syncScrollLock();
  }

  onEditToggle(event: Event, user: User): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.openEdit(user);
    } else {
      this.closeEdit();
    }
  }

  onOrderToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.openOrderHistory();
    } else {
      this.closeOrderHistory();
    }
  }

  closeEdit(): void {
    this.editOpen = false;
    this.setPopupToggle('account-edit-toggle', false);
    this.syncScrollLock();
  }

  openOrderHistory(): void {
    this.editOpen = false;
    this.orderHistoryOpen = true;
    this.setPopupToggle('account-edit-toggle', false);
    this.setPopupToggle('account-order-toggle', true);
    this.syncScrollLock();
  }

  closeOrderHistory(): void {
    this.orderHistoryOpen = false;
    this.setPopupToggle('account-order-toggle', false);
    this.syncScrollLock();
  }

  saveProfile(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    if (!this.form.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) {
      this.toast.show(this.i18n.t('nameEmailRequired'), 'error');
      return;
    }

    if (this.passwordForm.newPassword) {
      if (this.passwordForm.newPassword.length < 8 || this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
        this.toast.show(this.i18n.t('newPasswordsInvalid'), 'error');
        return;
      }
    }

    const updatedUser = {
      ...user,
      fullName: this.form.fullName.trim(),
      name: this.form.fullName.trim(),
      email: this.form.email.trim().toLowerCase(),
      phone: this.form.phone.trim(),
      address: this.form.address.trim(),
      password: this.passwordForm.newPassword || user.password
    };

    this.auth.updateProfile(updatedUser, this.passwordForm.currentPassword, this.passwordForm.newPassword).subscribe({
      next: (result) => {
        if (!result.success) {
          this.toast.show(result.message || this.i18n.t('currentPasswordIncorrect'), 'error');
          return;
        }

        this.editOpen = false;
        this.setPopupToggle('account-edit-toggle', false);
        this.syncScrollLock();
        this.toast.show(this.i18n.t('profileUpdatedSuccess'));
      },
      error: (error) => {
        this.toast.show(error?.error?.message || this.i18n.t('currentPasswordIncorrect'), 'error');
      }
    });
  }

  reorder(orderId: string): void {
    const order = this.auth.currentUser()?.orders.find((item) => item.id === orderId);
    if (!order) return;
    for (const item of order.items) this.cart.add(item.id, item.quantity);
    this.toast.show(this.i18n.t('itemsAddedToCart'));
  }

  loadWallet(): void {
    this.walletLoading.set(true);
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token ? this.walletService.getCurrentWallet(token) : throwError(() => new Error('No access token'))),
      catchError((error) => this.retryWalletLoadAfterAuthError(error))
    ).subscribe({
      next: (wallet) => {
        this.wallet.set(wallet);
        this.walletLoading.set(false);
      },
      error: () => {
        this.walletLoading.set(false);
      }
    });
  }

  private retryWalletLoadAfterAuthError(error: unknown) {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    return this.auth.ensureAccessToken(true).pipe(
      switchMap((token) => token ? this.walletService.getCurrentWallet(token) : throwError(() => error))
    );
  }

  private emptyForm() {
    return { fullName: '', email: '', phone: '', address: '' };
  }

  private setPopupToggle(id: string, checked: boolean): void {
    const input = this.document.getElementById(id);
    if (input instanceof HTMLInputElement) input.checked = checked;
  }

  private syncScrollLock(): void {
    const shouldLock = this.editOpen || this.orderHistoryOpen;
    if (shouldLock && !this.modalLockActive) {
      this.scrollLock.lock();
      this.modalLockActive = true;
    } else if (!shouldLock && this.modalLockActive) {
      this.scrollLock.unlock();
      this.modalLockActive = false;
    }
  }
}

