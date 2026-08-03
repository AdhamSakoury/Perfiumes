import { Component, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
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

  constructor(
    readonly auth: AuthService,
    readonly cart: CartService,
    readonly theme: ThemeService,
    private readonly scrollLock: ScrollLockService
  ) {
    effect((onCleanup) => {
      if (!this.mobileOpen()) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  firstName(name: string): string {
    return name.split(' ')[0] || name;
  }
}

