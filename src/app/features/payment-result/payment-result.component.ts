import { Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { WalletService, paymobConfirmPayloadFromParams } from '@core/services/wallet.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { catchError, of, switchMap, take, takeWhile, timer } from 'rxjs';

@Component({
  selector: 'app-payment-result',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
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
    || this.topUpId.startsWith('wtop_')
    || (!this.route.snapshot.queryParamMap.get('orderId')
      && !!this.route.snapshot.queryParamMap.get('id')
      && this.route.snapshot.queryParamMap.get('success') !== null);

  order?: Order;
  walletStatus: 'pending' | 'paid' | 'failed' = 'pending';
  loading = false;
  error = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly orders: OrderService,
    private readonly walletService: WalletService,
    private readonly auth: AuthService,
    private readonly i18n: LocalizationService
  ) {
    if (this.isWallet) {
      this.router.navigate(['/wallet'], {
        queryParams: this.route.snapshot.queryParams,
        replaceUrl: true
      });
      return;
    }

    if (this.orderId) {
      this.handleOrderResult();
      return;
    }

    const transactionId = this.route.snapshot.queryParamMap.get('id');
    if (transactionId) {
      this.resolvePaymobReturn(transactionId);
    }
  }

  get isOnlineSuccess(): boolean {
    return this.order?.paymentStatus === 'paid' || this.order?.paymentStatus === 'partiallyPaid';
  }

  private resolvePaymobReturn(transactionId: string): void {
    this.loading = true;
    this.auth.ensureAccessToken().pipe(
      switchMap((token) => token
        ? this.walletService.confirmPaymobTopUpReturn(token, paymobConfirmPayloadFromParams(this.route.snapshot.queryParamMap))
        : of(undefined)),
      catchError(() => of(undefined))
    ).subscribe((res) => {
      if (res?.kind === 'wallet' || res?.status === 'paid') {
        this.router.navigate(['/wallet'], {
          queryParams: this.route.snapshot.queryParams,
          replaceUrl: true
        });
        return;
      }

      this.loading = false;
      this.error = this.i18n.t('paymentStatusUnavailable');
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
        this.error = this.i18n.t('orderPaymentStatusUnavailable');
        return;
      }

      this.order = order;
    });
  }
}
