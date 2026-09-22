import { Component, HostListener, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { filter } from 'rxjs';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.css'
})
export class AdminSidebarComponent implements OnInit {
  readonly open = signal(false);
  readonly financeOpen = signal(false);

  constructor(
    readonly auth: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.checkFinanceRoute(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.checkFinanceRoute(event.urlAfterRedirects));
  }

  private checkFinanceRoute(url: string): void {
    if (url.startsWith('/admin/finance')) {
      this.financeOpen.set(true);
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  toggleFinance(): void {
    this.financeOpen.set(!this.financeOpen());
  }

  close(): void {
    this.open.set(false);
  }
}
