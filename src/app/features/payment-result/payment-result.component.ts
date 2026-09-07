import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { OrderService } from '@core/services/order.service';
import { catchError, of, switchMap, take, takeWhile, timer } from 'rxjs';

@Component({
  selector: 'app-payment-result',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './payment-result.component.html',
  styleUrl: './payment-result.component.css'
})
export class PaymentResultComponent {
  readonly orderId = this.route.snapshot.queryParamMap.get('orderId') || '';
  order?: Order;
  loading = false;
  error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly orders: OrderService
  ) {
    if (!this.orderId) return;

    this.loading = true;
    timer(0, 2_000).pipe(
      take(16),
      switchMap(() => this.orders.getById(this.orderId).pipe(catchError(() => of(undefined)))),
      takeWhile((order) => order?.paymentStatus === 'pending', true)
    ).subscribe((order) => {
      this.loading = false;
      if (!order) {
        this.error = 'We could not read the payment status. Please check your orders shortly.';
        return;
      }

      this.order = order;
    });
  }
}
