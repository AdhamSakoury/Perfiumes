import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { Component, HostListener, Inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { User } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { ToastService } from '@core/services/toast.service';
import { WishlistService } from '@core/services/wishlist.service';

@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css'
})
export class AccountPageComponent {
  editOpen = false;
  orderHistoryOpen = false;
  readonly recentOrders = computed(() => (this.auth.currentUser()?.orders || []).slice(0, 3));
  form = this.emptyForm();
  passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  private modalLockActive = false;

  constructor(
    readonly auth: AuthService,
    readonly wishlist: WishlistService,
    private readonly cart: CartService,
    readonly toast: ToastService,
    private readonly scrollLock: ScrollLockService,
    @Inject(DOCUMENT) private readonly document: Document
  ) {}

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
      this.toast.show('Name and a valid email are required.', 'error');
      return;
    }

    if (this.passwordForm.newPassword) {
      if (this.passwordForm.currentPassword !== user.password) {
        this.toast.show('Current password is incorrect.', 'error');
        return;
      }
      if (this.passwordForm.newPassword.length < 8 || this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
        this.toast.show('New passwords must match and be at least 8 characters.', 'error');
        return;
      }
    }

    this.auth.updateCurrentUser({
      ...user,
      fullName: this.form.fullName.trim(),
      name: this.form.fullName.trim(),
      email: this.form.email.trim().toLowerCase(),
      phone: this.form.phone.trim(),
      address: this.form.address.trim(),
      password: this.passwordForm.newPassword || user.password
    });
    this.editOpen = false;
    this.setPopupToggle('account-edit-toggle', false);
    this.syncScrollLock();
    this.toast.show('Profile updated successfully!');
  }

  reorder(orderId: string): void {
    const order = this.auth.currentUser()?.orders.find((item) => item.id === orderId);
    if (!order) return;
    for (const item of order.items) this.cart.add(item.id, item.quantity);
    this.toast.show('Items added to cart!');
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

