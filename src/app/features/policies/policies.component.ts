import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

type PolicyKey = 'about' | 'shipping' | 'returns' | 'privacy' | 'terms' | 'faq' | 'authenticity';

const POLICIES: Record<PolicyKey, { title: string; body: string[] }> = {
  about: {
    title: 'About Gnouby',
    body: [
      'Gnouby is a fragrance store built around warm, expressive scent stories inspired by Nubian heritage, golden landscapes, and modern personal style.',
      'The store experience is designed for discovery first: customers can browse by mood, notes, gender, season, concentration, rating, and budget before placing an order.',
      'Behind the storefront, the admin workflow connects products, inventory, orders, shipping status, wallets, support conversations, notifications, promo codes, and newsletter subscribers.',
      'Our business promise is simple: clear product information, careful fulfillment, reachable support, and a shopping journey that feels personal rather than generic.'
    ]
  },
  shipping: {
    title: 'Shipping Information',
    body: [
      'Cairo and Giza orders are estimated within 2 business days. Alexandria and other governorates are estimated within 3-5 business days.',
      'Shipping fees are calculated at checkout by city and confirmed again by the backend when the order is created.',
      'When an order is shipped, the customer order page shows courier details and a tracking number.'
    ]
  },
  returns: {
    title: 'Returns & Refunds',
    body: [
      'Unopened products can be reviewed for return within 14 days of delivery.',
      'Opened fragrance products are not eligible for return unless damaged or incorrectly fulfilled.',
      'Refunds are handled to the original payment method or to the customer wallet after admin approval.'
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    body: [
      'Customer account, order, support, and newsletter data is used to operate the store and provide service updates.',
      'Marketing messages require newsletter subscription or promotion preferences.',
      'Admin-only views protect operational data behind authenticated admin access.'
    ]
  },
  terms: {
    title: 'Terms & Conditions',
    body: [
      'Orders are accepted subject to stock availability, successful payment confirmation, and correct delivery details.',
      'Prices, promo codes, shipping fees, and delivery estimates may change before an order is placed.',
      'Customers are responsible for providing reachable contact and shipping information.'
    ]
  },
  faq: {
    title: 'Frequently Asked Questions',
    body: [
      'How long does delivery take? Cairo and Giza orders are estimated within 2 business days, Alexandria within 3-4 business days, and other governorates within 4-5 business days.',
      'How is shipping calculated? Shipping is calculated at checkout based on the delivery city, then confirmed again by the backend when the order is created.',
      'Can I pay on delivery? Yes. Cash on delivery is available, and wallet/card/InstaPay flows are also prepared in the checkout experience.',
      'Where can I track my order? After placing an order, open Orders from your account. Shipped orders show courier details, tracking number, delivery estimate, and status history.',
      'Can I use promo codes? Yes. Promo codes are validated against active backend promo campaigns before the order total is finalized.',
      'What if an item is out of stock? Product cards and details show stock availability. The backend also blocks orders when stock is not enough.',
      'How do I contact support? Sign in and open Messages. Customers can start support conversations and admins can reply from the admin inbox.',
      'Can I return a product? Unopened products can be reviewed for return within 14 days of delivery. Opened fragrance products are only reviewed if damaged or incorrectly fulfilled.'
    ]
  },
  authenticity: {
    title: 'Authenticity Promise',
    body: [
      'Product pages should clearly identify whether a product is original, inspired, private-label, tester, or sample before launch.',
      'Each dispatch should be checked against the order details and packed with traceable inventory movement.',
      'Customers can contact support from their account for sourcing, packaging, or fulfillment questions.'
    ]
  }
};

@Component({
  selector: 'app-policies-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './policies.component.html',
  styleUrl: './policies.component.css'
})
export class PoliciesPageComponent {
  readonly key = signal<PolicyKey>('about');
  readonly policy = computed(() => POLICIES[this.key()]);
  readonly links = Object.entries(POLICIES).map(([key, policy]) => ({ key: key as PolicyKey, title: policy.title }));

  constructor(route: ActivatedRoute) {
    route.paramMap.subscribe((params) => {
      const type = params.get('type') as PolicyKey | null;
      this.key.set(type && POLICIES[type] ? type : 'about');
    });
  }
}
