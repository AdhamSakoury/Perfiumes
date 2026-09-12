import { Component, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ThemeService } from '@core/services/theme.service';

@Component({
  selector: 'app-delivery-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './delivery-dashboard.component.html',
  styleUrl: './delivery-dashboard.component.css'
})
export class DeliveryDashboardComponent {
  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly outForDelivery = computed(() => this.orders().filter((order) => order.status === 'OutForDelivery').length);
  readonly delivered = computed(() => this.orders().filter((order) => order.status === 'Delivered').length);
  readonly pending = computed(() => this.orders().filter((order) => !['OutForDelivery', 'Delivered', 'Cancelled'].includes(order.status)).length);

  constructor(private readonly auth: AuthService, private readonly ordersApi: OrderService, private readonly router: Router, readonly theme: ThemeService) {
    if (this.auth.currentUser()?.role !== 'delivery') {
      void this.router.navigateByUrl('/');
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        void this.router.navigate(['/login'], { queryParams: { redirect: '/delivery' } });
        return;
      }
      this.ordersApi.getDeliveryOrders(token).subscribe({
        next: (orders) => { this.orders.set(orders); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    });
  }
}
