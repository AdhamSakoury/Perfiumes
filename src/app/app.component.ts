import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ThemeService } from '@core/services/theme.service';
import { ToastService } from '@core/services/toast.service';
import { FooterComponent } from './layouts/footer/footer.component';
import { NavbarComponent } from './layouts/navbar/navbar.component';
import { AdminSidebarComponent } from './layouts/admin-sidebar/admin-sidebar.component';
import { DeliverySidebarComponent } from './layouts/delivery-sidebar/delivery-sidebar.component';
import { ChatbotWidgetComponent } from './shared/components/chatbot-widget/chatbot-widget.component';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AdminSidebarComponent, DeliverySidebarComponent, ChatbotWidgetComponent, FooterComponent, NavbarComponent, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  readonly currentUrl = signal('');
  readonly authFullscreen = computed(() => {
    const url = this.currentUrl().split('?')[0].split('#')[0];
    return url === '/login' || url === '/register' || url === '/forgot-password' || url === '/reset-password';
  });
  readonly showAdminSidebar = computed(() => {
    const user = this.auth.currentUser();
    if (user?.role !== 'admin') return false;

    const url = this.currentUrl().split('?')[0].split('#')[0];
    return url !== '/' && url !== '/perfumes' && !url.startsWith('/perfumes/');
  });
  readonly showGlobalChrome = computed(() => !this.authFullscreen());
  readonly showDeliverySidebar = computed(() => this.auth.currentUser()?.role === 'delivery' && this.currentUrl().split('?')[0].startsWith('/delivery'));
  private routeSubscription?: Subscription;

  constructor(
    private readonly theme: ThemeService,
    readonly toast: ToastService,
    private readonly router: Router,
    private readonly auth: AuthService
  ) {}

  ngOnInit(): void {
    this.theme.init();
    this.currentUrl.set(this.router.url);
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

}

