import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminUser } from '@core/models/store.models';
import { AdminDashboardService } from '@core/services/admin-dashboard.service';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, CustomDropdownComponent, TranslatePipe],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css'
})
export class AdminUsersComponent {
  readonly users = signal<AdminUser[]>([]);
  readonly query = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'blocked'>('all');

  readonly filteredUsers = computed(() => {
    const q = this.query().trim().toLowerCase();
    const filter = this.statusFilter();

    return this.users().filter((user) => {
      const matchesQuery =
        !q ||
        user.fullName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.phone?.toLowerCase().includes(q) ||
        user.id.toLowerCase().includes(q);

      const matchesStatus =
        filter === 'all' ||
        (filter === 'active' && !user.isBlocked) ||
        (filter === 'blocked' && user.isBlocked);

      return matchesQuery && matchesStatus;
    });
  });

  readonly totalCount = computed(() => this.users().length);
  readonly activeCount = computed(() => this.users().filter((u) => !u.isBlocked).length);
  readonly blockedCount = computed(() => this.users().filter((u) => u.isBlocked).length);

  loading = false;
  loadError = '';
  updatingUserId: string | null = null;

  selectedUserForBlock: AdminUser | null = null;
  selectedUserForDelete: AdminUser | null = null;
  blockReason = '';
  showCreateDelivery = false;
  creatingDelivery = false;
  deletingUserId: string | null = null;
  deliveryForm = { fullName: '', email: '', password: '', confirmPassword: '', phone: '', address: '' };

  constructor(
    readonly auth: AuthService,
    private readonly dashboard: AdminDashboardService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/users' } });
      return;
    }

    this.load();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get statusOptions(): CustomDropdownOption[] {
    return [
      { value: 'all', label: this.i18n.t('allStatus') || 'All Status', icon: 'fa-layer-group' },
      { value: 'active', label: this.i18n.t('status_active') || 'Active', icon: 'fa-check-circle' },
      { value: 'blocked', label: this.i18n.t('status_blocked') || 'Blocked', icon: 'fa-ban' }
    ];
  }

  setStatusFilter(value: string): void {
    if (value === 'all' || value === 'active' || value === 'blocked') {
      this.statusFilter.set(value);
    }
  }

  load(): void {
    if (!this.isAdmin) {
      this.loadError = this.i18n.t('loginAgainAdmin');
      return;
    }

    this.loading = true;
    this.loadError = '';

    this.fetchWithAuth((token) => this.dashboard.getUsers(token)).subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading = false;
      },
      error: (err: unknown) => {
        this.loading = false;
        this.loadError = err instanceof HttpErrorResponse
          ? err.error?.message || 'Could not load users list.'
          : 'Could not load users list.';
      }
    });
  }

  openBlockModal(user: AdminUser): void {
    if (user.role === 'admin') return;
    this.selectedUserForBlock = user;
    this.blockReason = '';
  }

  closeBlockModal(): void {
    this.selectedUserForBlock = null;
    this.blockReason = '';
  }

  openCreateDelivery(): void {
    this.deliveryForm = { fullName: '', email: '', password: '', confirmPassword: '', phone: '', address: '' };
    this.showCreateDelivery = true;
  }

  closeCreateDelivery(): void {
    if (!this.creatingDelivery) this.showCreateDelivery = false;
  }

  createDelivery(): void {
    const form = this.deliveryForm;
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 6 || form.password !== form.confirmPassword) {
      this.toast.show('Enter a name and email, and use matching passwords of at least 6 characters.', 'error');
      return;
    }

    this.creatingDelivery = true;
    this.fetchWithAuth((token) => this.dashboard.createDelivery({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim(),
      address: form.address.trim()
    }, token)).subscribe({
      next: (deliveryUser) => {
        this.users.update((list) => [deliveryUser, ...list]);
        this.creatingDelivery = false;
        this.showCreateDelivery = false;
        this.toast.show('Delivery account created successfully.', 'success');
      },
      error: (err: unknown) => {
        this.creatingDelivery = false;
        this.toast.show(err instanceof HttpErrorResponse ? err.error?.message || 'Could not create delivery account.' : 'Could not create delivery account.', 'error');
      }
    });
  }

  openDeleteModal(user: AdminUser): void {
    if (user.role !== 'admin') this.selectedUserForDelete = user;
  }

  closeDeleteModal(): void {
    if (!this.deletingUserId) this.selectedUserForDelete = null;
  }

  confirmDelete(): void {
    const user = this.selectedUserForDelete;
    if (!user) return;

    this.deletingUserId = user.id;
    this.fetchWithAuth((token) => this.dashboard.deleteUser(user.id, token)).subscribe({
      next: () => {
        this.users.update((list) => list.filter((item) => item.id !== user.id));
        this.deletingUserId = null;
        this.selectedUserForDelete = null;
        this.toast.show('User account removed.', 'success');
      },
      error: (err: unknown) => {
        this.deletingUserId = null;
        this.toast.show(err instanceof HttpErrorResponse ? err.error?.message || 'Could not remove user.' : 'Could not remove user.', 'error');
      }
    });
  }

  confirmBlock(): void {
    const user = this.selectedUserForBlock;
    if (!user) return;

    this.executeToggleBlock(user.id, true, this.blockReason.trim());
    this.closeBlockModal();
  }

  unblockUser(user: AdminUser): void {
    this.executeToggleBlock(user.id, false, '');
  }

  private executeToggleBlock(userId: string, isBlocked: boolean, reason: string): void {
    this.updatingUserId = userId;

    this.fetchWithAuth((token) =>
      this.dashboard.toggleBlockUser(userId, isBlocked, reason, token)
    ).subscribe({
      next: (updatedUser) => {
        this.users.update((list) =>
          list.map((u) => (u.id === updatedUser.id ? updatedUser : u))
        );
        this.updatingUserId = null;
        this.toast.show(
          isBlocked
            ? this.i18n.t('userBlockedSuccess')
            : this.i18n.t('userUnblockedSuccess')
        );
      },
      error: (err: unknown) => {
        this.updatingUserId = null;
        const msg = err instanceof HttpErrorResponse
          ? err.error?.message || 'Action failed'
          : 'Action failed';
        this.toast.show(msg);
      }
    });
  }

  private fetchWithAuth<T>(requestFn: (token: string) => Observable<T>): Observable<T> {
    return this.auth.ensureAccessToken().pipe(
      switchMap((token) => {
        if (!token) return throwError(() => new Error('No admin token'));
        return requestFn(token);
      }),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          return this.auth.ensureAccessToken(true).pipe(
            switchMap((refreshedToken) => {
              if (!refreshedToken) return throwError(() => error);
              return requestFn(refreshedToken);
            })
          );
        }
        return throwError(() => error);
      })
    );
  }
}
