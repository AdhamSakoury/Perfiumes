import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order, OrderMessage } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { OrderTrackingService } from '@core/services/order-tracking.service';
import { ToastService } from '@core/services/toast.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CHAT_EMOJIS } from '@core/constants/emoji.constants';

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
  readonly emojiPickerOpen = signal(false);
  readonly chatEmojis = CHAT_EMOJIS;
  readonly recording = signal(false);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private voicePointerActive = false;
  private voiceCancelRequested = false;
  private voiceStartX = 0;
  private sendVoiceAfterStop = false;
  pendingVoiceFile?: File;

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
        this.messages.update((list) => list.some((item) => item.id === msg.id) ? list : [...list, msg]);
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
    if (this.recording()) {
      this.sendVoiceAfterStop = true;
      this.mediaRecorder?.stop();
      return;
    }
    if (this.pendingVoiceFile) {
      this.sendPendingVoice();
      return;
    }
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
        next: (message) => {
          this.newMessage = '';
          this.appendMessage(message);
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

  appendEmoji(emoji: string): void {
    this.newMessage += emoji;
    this.emojiPickerOpen.set(false);
  }

  onMediaSelected(event: Event, type: 'image' | 'audio' | 'document'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.sendMedia(file, type);
  }

  toggleRecording(): void {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }
    this.pendingVoiceFile = undefined;
    void this.beginRecording();
  }

  private async beginRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.toast.show('Voice recording is not supported by this browser.', 'error');
      this.voicePointerActive = false;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordedChunks = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) this.recordedChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          this.pendingVoiceFile = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
        }
        this.recording.set(false);
        if (this.sendVoiceAfterStop && this.pendingVoiceFile) {
          this.sendVoiceAfterStop = false;
          this.sendPendingVoice();
        }
      };
      this.mediaRecorder.start();
      this.recording.set(true);
    } catch {
      this.voicePointerActive = false;
      this.toast.show('Microphone permission is required.', 'error');
    }
  }

  sendPendingVoice(): void {
    if (!this.pendingVoiceFile || this.sending()) return;
    const file = this.pendingVoiceFile;
    this.pendingVoiceFile = undefined;
    this.sendMedia(file, 'audio');
  }

  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${environment.apiBaseUrl}${url || ''}`;
  }

  private sendMedia(file: File, type: 'image' | 'audio' | 'document'): void {
    if (this.sending()) return;
    this.sending.set(true);
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.sending.set(false);
        this.toast.show('Please log in again to send files.', 'error');
        return;
      }
      this.ordersApi.sendOrderMedia(this.order.id, file, type, token).subscribe({
        next: (message) => {
          this.appendMessage(message);
          this.sending.set(false);
          this.shouldScrollToBottom = true;
        },
        error: (err) => {
          this.sending.set(false);
          this.toast.show(err?.error?.message || 'Failed to send file.', 'error');
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

  private appendMessage(message: OrderMessage): void {
    this.messages.update((list) => list.some((item) => item.id === message.id) ? list : [...list, message]);
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
