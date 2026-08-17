import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-payment-result',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './payment-result.component.html',
  styleUrl: './payment-result.component.css'
})
export class PaymentResultComponent {
  readonly orderId = this.route.snapshot.queryParamMap.get('orderId') || '';

  constructor(private readonly route: ActivatedRoute) {}
}
