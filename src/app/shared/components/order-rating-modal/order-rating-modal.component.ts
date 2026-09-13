import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { ToastService } from '@core/services/toast.service';

interface ProductRatingForm {
  productId: number;
  productName: string;
  productImage: string;
  rating: number;
  hoverRating: number;
  comment: string;
  submitting: boolean;
  submitted: boolean;
}

@Component({
  selector: 'app-order-rating-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-rating-modal.component.html',
  styleUrl: './order-rating-modal.component.css'
})
export class OrderRatingModalComponent implements OnInit {
  @Input({ required: true }) order!: Order;
  @Output() closeModal = new EventEmitter<void>();

  activeTab: 'products' | 'delivery' = 'products';
  loading = signal(true);

  productForms: ProductRatingForm[] = [];

  deliveryForm = {
    rating: 5,
    hoverRating: 5,
    comment: '',
    submitting: false,
    submitted: false
  };

  constructor(
    private readonly ordersApi: OrderService,
    private readonly auth: AuthService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.loadExistingRatings();
  }

  private initForms(): void {
    this.productForms = this.order.items.map((item) => ({
      productId: item.id,
      productName: item.name,
      productImage: item.image,
      rating: 5,
      hoverRating: 5,
      comment: '',
      submitting: false,
      submitted: false
    }));
  }

  loadExistingRatings(): void {
    this.loading.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.loading.set(false);
        return;
      }

      this.ordersApi.getOrderRatings(this.order.id, token).subscribe({
        next: (status) => {
          if (status.hasRatedDelivery) {
            this.deliveryForm.submitted = true;
            this.deliveryForm.rating = status.deliveryRating || 5;
            this.deliveryForm.comment = status.deliveryComment || '';
          }

          for (const rev of status.productReviews) {
            const form = this.productForms.find((f) => f.productId === rev.productId);
            if (form) {
              form.submitted = true;
              form.rating = rev.rating;
              form.comment = rev.comment;
            }
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        }
      });
    });
  }

  setProductStar(form: ProductRatingForm, star: number): void {
    if (form.submitted) return;
    form.rating = star;
    form.hoverRating = star;
  }

  setDeliveryStar(star: number): void {
    if (this.deliveryForm.submitted) return;
    this.deliveryForm.rating = star;
    this.deliveryForm.hoverRating = star;
  }

  submitProductReview(form: ProductRatingForm): void {
    if (form.submitting || form.submitted) return;
    form.submitting = true;

    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        form.submitting = false;
        this.toast.show('Please log in again to rate.', 'error');
        return;
      }

      this.ordersApi.submitProductReview(this.order.id, form.productId, form.rating, form.comment, token).subscribe({
        next: () => {
          form.submitting = false;
          form.submitted = true;
          this.toast.show(`Rating for "${form.productName}" saved!`, 'success');
        },
        error: (err) => {
          form.submitting = false;
          this.toast.show(err?.error?.message || 'Could not save review.', 'error');
        }
      });
    });
  }

  submitDeliveryRating(): void {
    if (this.deliveryForm.submitting || this.deliveryForm.submitted) return;
    this.deliveryForm.submitting = true;

    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.deliveryForm.submitting = false;
        this.toast.show('Please log in again to rate.', 'error');
        return;
      }

      this.ordersApi.submitDeliveryRating(this.order.id, this.deliveryForm.rating, this.deliveryForm.comment, token).subscribe({
        next: () => {
          this.deliveryForm.submitting = false;
          this.deliveryForm.submitted = true;
          this.toast.show('Delivery rating submitted successfully!', 'success');
        },
        error: (err) => {
          this.deliveryForm.submitting = false;
          this.toast.show(err?.error?.message || 'Could not save delivery rating.', 'error');
        }
      });
    });
  }
}
