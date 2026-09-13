import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order, OrderMessage } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { OrderTrackingService } from '@core/services/order-tracking.service';
import { ToastService } from '@core/services/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-order-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-chat.component.html',
  styleUrl: './order-chat.component.css'
})
export class OrderChatComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input({ required: true }) order!: Order;
  @Input({ required: true }) currentRole: 'customer' | 'delivery' | 'admin' = 'customer';
  @Output() closeChat = new EventEmitter<void>();

  @ViewChild('messagesContainer') private messagesContainer!: ElementRef<HTMLDivElement>;

  readonly messages = signal<OrderMessage[]>([]);
  readonly loading = signal(true);
  readonly sending = signal(false);
  newMessage = '';

  private messageSub?: Subscription;
  private shouldScrollToBottom = false;

  constructor(
    private readonly ordersApi: OrderService,
    private readonly trackingService: OrderTrackingService,
    private readonly auth: AuthService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.trackingService.joinOrder(this.order.id);
    this.loadMessages();

    this.messageSub = this.trackingService.message$.subscribe((msg) => {
      if (msg.orderId.toLowerCase() === this.order.id.toLowerCase()) {
        this.messages.update((list) => [...list, msg]);
        this.shouldScrollToBottom = true;
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.messageSub?.unsubscribe();
  }

  loadMessages(): void {
    this.loading.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.loading.set(false);
        return;
      }

      this.ordersApi.getOrderMessages(this.order.id, token).subscribe({
        next: (msgs) => {
          this.messages.set(msgs);
          this.loading.set(false);
          this.shouldScrollToBottom = true;
        },
        error: () => {
          this.loading.set(false);
          this.toast.show('Could not load chat messages.', 'error');
        }
      });
    });
  }

  sendMessage(): void {
    const text = this.newMessage.trim();
    if (!text || this.sending()) return;

    this.sending.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.sending.set(false);
        this.toast.show('Please log in again to send messages.', 'error');
        return;
      }

      this.ordersApi.sendOrderMessage(this.order.id, text, token).subscribe({
        next: () => {
          this.newMessage = '';
          this.sending.set(false);
          this.shouldScrollToBottom = true;
        },
        error: (err) => {
          this.sending.set(false);
          this.toast.show(err?.error?.message || 'Failed to send message.', 'error');
        }
      });
    });
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  cleanPhone(phone?: string | null): string {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
  }

  get partnerName(): string {
    if (this.currentRole === 'customer') {
      return this.order.deliveryName || 'Delivery Courier';
    }
    return this.order.shippingAddress.name || 'Customer';
  }

  get partnerPhone(): string {
    if (this.currentRole === 'customer') {
      return this.order.deliveryPhone || '';
    }
    return this.order.shippingAddress.phone || '';
  }

  isMyMessage(msg: OrderMessage): boolean {
    if (this.currentRole === 'customer') {
      return msg.senderRole === 'customer';
    }
    if (this.currentRole === 'delivery') {
      return msg.senderRole === 'delivery';
    }
    return msg.senderRole === 'admin';
  }
}
