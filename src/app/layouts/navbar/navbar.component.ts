import { Component, effect, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { LocalizationService } from '@core/services/localization.service';
import { AppNotification, NotificationService } from '@core/services/notification.service';
import { ScrollLockService } from '@core/services/scroll-lock.service';
import { ThemeService } from '@core/services/theme.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  readonly mobileOpen = signal(false);
  readonly notificationsOpen = signal(false);
  readonly adminMenuOpen = signal(false);

  constructor(
    readonly auth: AuthService,
    readonly cart: CartService,
    readonly i18n: LocalizationService,
    readonly notifications: NotificationService,
    readonly theme: ThemeService,
    private readonly router: Router,
    private readonly scrollLock: ScrollLockService
  ) {
    effect((onCleanup) => {
      if (!this.mobileOpen()) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });

    effect(() => {
      if (this.auth.currentUser()) {
        this.notifications.connectForCurrentUser();
        this.notifications.load();
      } else {
        this.notifications.disconnect();
        this.notificationsOpen.set(false);
      }
    });
  }

  firstName(name: string): string {
    return name.split(' ')[0] || name;
  }

  toggleNotifications(): void {
    this.notificationsOpen.set(!this.notificationsOpen());
    if (this.notificationsOpen()) this.adminMenuOpen.set(false);
    if (this.notificationsOpen()) {
      this.notifications.load();
    }
  }

  toggleAdminMenu(): void {
    this.adminMenuOpen.set(!this.adminMenuOpen());
    if (this.adminMenuOpen()) this.notificationsOpen.set(false);
  }

  toggleLanguage(): void {
    this.i18n.setLanguage(this.i18n.language() === 'ar' ? 'en' : 'ar');
  }

  openNotification(notification: AppNotification): void {
    this.notifications.markAsRead(notification.id);
    this.notificationsOpen.set(false);
    this.mobileOpen.set(false);

    if (notification.link) {
      void this.router.navigateByUrl(notification.link);
    }
  }
}

