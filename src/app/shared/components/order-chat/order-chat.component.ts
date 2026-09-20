import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, signal, ViewChild } from '@angular/core';
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
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraFallbackInput') cameraFallbackInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') set cameraVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.cameraVideo = ref;
    if (ref?.nativeElement && this.cameraStream) {
      ref.nativeElement.srcObject = this.cameraStream;
      ref.nativeElement.play().catch(() => {});
    }
  }
  cameraVideo?: ElementRef<HTMLVideoElement>;

  readonly messages = signal<OrderMessage[]>([]);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly cameraOpen = signal(false);
  private cameraStream?: MediaStream;
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
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.emojiPickerOpen()) {
      this.emojiPickerOpen.set(false);
      this.cdr.markForCheck();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.emojiPickerOpen() && target && !target.closest('.emoji-tool')) {
      this.emojiPickerOpen.set(false);
      this.cdr.markForCheck();
    }
  }

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
    this.closeCamera();
  }

  async openCamera(): Promise<void> {
    if (this.sending()) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.cameraFallbackInput?.nativeElement?.click();
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      this.cameraStream = stream;
      this.cameraOpen.set(true);
      if (this.cameraVideo?.nativeElement) {
        this.cameraVideo.nativeElement.srcObject = stream;
        void this.cameraVideo.nativeElement.play().catch(() => {});
      }
    } catch (err) {
      console.warn('getUserMedia failed:', err);
      this.toast.show('Could not access camera. Please allow camera access in browser settings.', 'error');
    }
  }

  closeCamera(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = undefined;
    }
    this.cameraOpen.set(false);
  }

  capturePhoto(): void {
    const video = this.cameraVideo?.nativeElement;
    const canvas = this.cameraCanvas?.nativeElement;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        this.closeCamera();
        this.sendMedia(file, 'image');
      }
    }, 'image/jpeg', 0.85);
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

  appendEmoji(emoji: string, inputEl?: HTMLInputElement): void {
    if (inputEl) {
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;
      const val = inputEl.value;
      inputEl.value = val.slice(0, start) + emoji + val.slice(end);
      inputEl.selectionStart = inputEl.selectionEnd = start + emoji.length;
      inputEl.focus();
      this.newMessage = inputEl.value;
    } else {
      this.newMessage = (this.newMessage || '') + emoji;
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
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
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.recordedChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (this.recordedChunks.length > 0) {
          let ext = 'webm';
          const mime = this.mediaRecorder?.mimeType?.toLowerCase() || '';
          if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'm4a';
          else if (mime.includes('ogg') || mime.includes('opus')) ext = 'ogg';
          else if (mime.includes('wav')) ext = 'wav';

          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          this.pendingVoiceFile = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
        }
        this.recording.set(false);
        if (this.sendVoiceAfterStop && this.pendingVoiceFile) {
          this.sendVoiceAfterStop = false;
          this.sendPendingVoice();
        }
      };
      this.mediaRecorder.start(250);
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
    const token = this.auth.currentAccessToken();
    const user = this.auth.currentUser();
    this.ordersApi.sendOrderMedia(
      this.order.id,
      file,
      type,
      token,
      user?.email,
      this.currentRole,
      user?.fullName
    ).subscribe({
      next: (message) => {
        this.appendMessage(message);
        this.sending.set(false);
        this.shouldScrollToBottom = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sending.set(false);
        this.toast.show(err?.error?.message || 'Failed to send file.', 'error');
        this.cdr.markForCheck();
      }
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
