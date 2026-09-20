import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { WalletService } from '@core/services/wallet.service';
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
  readonly topUpId = this.route.snapshot.queryParamMap.get('topUpId')
    || this.route.snapshot.queryParamMap.get('merchant_order_id')
    || this.route.snapshot.queryParamMap.get('special_reference')
    || '';
  readonly isWallet = this.route.snapshot.queryParamMap.get('type') === 'wallet'
    || this.topUpId.startsWith('wtop_');

  order?: Order;
  walletStatus: 'pending' | 'paid' | 'failed' = 'pending';
  loading = false;
  error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly orders: OrderService,
    private readonly walletService: WalletService,
    private readonly auth: AuthService
  ) {
    if (this.isWallet && this.topUpId) {
      this.handleWalletResult();
    } else if (this.orderId) {
      this.handleOrderResult();
    }
  }

  private handleWalletResult(): void {
    const success = this.route.snapshot.queryParamMap.get('success');
    const transactionId = this.route.snapshot.queryParamMap.get('id') || undefined;

    if (success === 'false') {
      this.walletStatus = 'failed';
      this.loading = false;
      return;
    }

    this.loading = true;
    timer(0, 2_000).pipe(
      take(8),
      switchMap(() => this.auth.ensureAccessToken().pipe(
        switchMap((token) => token ? this.walletService.confirmPaymobTopUp(token, this.topUpId, transactionId) : of(undefined)),
        catchError(() => of(undefined))
      )),
      takeWhile((res) => !res || res.status === 'pending', true)
    ).subscribe((res) => {
      this.loading = false;
      if (!res) {
        this.walletStatus = 'pending';
        return;
      }
      this.walletStatus = res.status === 'paid' ? 'paid' : 'failed';
    });
  }

  private handleOrderResult(): void {
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
