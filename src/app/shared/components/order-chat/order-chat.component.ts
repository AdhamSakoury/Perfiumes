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
import { AudioMessagePlayerComponent } from '@shared/components/audio-message-player/audio-message-player.component';

@Component({
  selector: 'app-order-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AudioMessagePlayerComponent],
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
  newMessage = '';

  // Emojis
  readonly emojiPickerOpen = signal(false);
  readonly chatEmojis = CHAT_EMOJIS;

  // Lightbox
  readonly lightboxImageUrl = signal<string | null>(null);

  // Camera
  readonly cameraOpen = signal(false);
  readonly capturedPhotoUrl = signal<string | null>(null);
  private cameraStream?: MediaStream;
  private pendingCapturedFile?: File;

  // Staged image / media
  readonly pendingImageFile = signal<File | null>(null);
  readonly pendingImageUrl = signal<string | null>(null);
  readonly pendingDocFile = signal<File | null>(null);

  // Voice recording & preview
  readonly recording = signal(false);
  readonly recordingDuration = signal(0);
  readonly pendingVoiceFile = signal<File | null>(null);
  readonly pendingVoiceUrl = signal<string | null>(null);
  readonly isPlayingPreview = signal(false);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private recordingTimer?: any;
  private audioPreviewPlayer?: HTMLAudioElement;

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
    if (this.lightboxImageUrl()) {
      this.closeLightbox();
      return;
    }
    if (this.cameraOpen()) {
      this.closeCamera();
      return;
    }
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

    this.messageSub = this.trackingService.message$.subscribe((rawMsg: any) => {
      const msg: OrderMessage = {
        id: rawMsg.id || rawMsg.Id,
        orderId: rawMsg.orderId || rawMsg.OrderId || '',
        senderRole: rawMsg.senderRole || rawMsg.SenderRole || 'customer',
        senderName: rawMsg.senderName || rawMsg.SenderName || 'User',
        senderEmail: rawMsg.senderEmail || rawMsg.SenderEmail || '',
        message: rawMsg.message || rawMsg.Message || '',
        createdAt: rawMsg.createdAt || rawMsg.CreatedAt || new Date().toISOString(),
        messageType: rawMsg.messageType || rawMsg.MessageType || 'text',
        mediaUrl: rawMsg.mediaUrl || rawMsg.MediaUrl || null,
        fileName: rawMsg.fileName || rawMsg.FileName || null
      };

      if (msg.orderId && msg.orderId.toLowerCase() === this.order.id.toLowerCase()) {
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
    this.clearRecordingTimer();
    this.stopAudioPreview();
    this.clearPendingImage();
    this.clearPendingVoice();
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

  // --- Camera Functionality ---
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
      this.capturedPhotoUrl.set(null);
      this.pendingCapturedFile = undefined;
      this.cameraOpen.set(true);

      if (this.cameraVideo?.nativeElement) {
        this.cameraVideo.nativeElement.srcObject = stream;
        void this.cameraVideo.nativeElement.play().catch(() => {});
      }
      this.cdr.markForCheck();
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
    const captured = this.capturedPhotoUrl();
    if (captured) {
      URL.revokeObjectURL(captured);
    }
    this.capturedPhotoUrl.set(null);
    this.pendingCapturedFile = undefined;
    this.cameraOpen.set(false);
    this.cdr.markForCheck();
  }

  snapPhoto(): void {
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
        this.pendingCapturedFile = file;
        const previewUrl = URL.createObjectURL(file);
        this.capturedPhotoUrl.set(previewUrl);
        this.cdr.markForCheck();
      }
    }, 'image/jpeg', 0.88);
  }

  retakePhoto(): void {
    const captured = this.capturedPhotoUrl();
    if (captured) {
      URL.revokeObjectURL(captured);
    }
    this.capturedPhotoUrl.set(null);
    this.pendingCapturedFile = undefined;
    if (this.cameraVideo?.nativeElement && this.cameraStream) {
      this.cameraVideo.nativeElement.srcObject = this.cameraStream;
      void this.cameraVideo.nativeElement.play().catch(() => {});
    }
    this.cdr.markForCheck();
  }

  confirmCapturedPhoto(): void {
    const file = this.pendingCapturedFile;
    if (!file) return;

    this.clearPendingImage();
    this.pendingImageFile.set(file);
    this.pendingImageUrl.set(URL.createObjectURL(file));
    this.closeCamera();
    this.toast.show('Photo attached. Click Send to deliver.', 'success');
  }

  // --- Image & Document Selection ---
  onMediaSelected(event: Event, type: 'image' | 'document'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      this.toast.show('File size exceeds 15 MB limit.', 'error');
      return;
    }

    if (type === 'image') {
      if (!file.type.startsWith('image/')) {
        this.toast.show('Please select a valid image.', 'error');
        return;
      }
      this.clearPendingImage();
      this.pendingImageFile.set(file);
      this.pendingImageUrl.set(URL.createObjectURL(file));
      this.cdr.markForCheck();
    } else {
      this.clearPendingDoc();
      this.pendingDocFile.set(file);
      this.cdr.markForCheck();
    }
  }

  clearPendingImage(): void {
    const url = this.pendingImageUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.pendingImageUrl.set(null);
    this.pendingImageFile.set(null);
    this.cdr.markForCheck();
  }

  clearPendingDoc(): void {
    this.pendingDocFile.set(null);
    this.cdr.markForCheck();
  }

  // --- Voice Note Recording ---
  toggleRecording(): void {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }
    this.clearPendingVoice();
    void this.beginRecording();
  }

  private async beginRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.toast.show('Voice recording is not supported by this browser.', 'error');
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
        this.clearRecordingTimer();
        this.recording.set(false);

        if (this.recordedChunks.length > 0) {
          let ext = 'webm';
          const mime = this.mediaRecorder?.mimeType?.toLowerCase() || '';
          if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'm4a';
          else if (mime.includes('ogg') || mime.includes('opus')) ext = 'ogg';
          else if (mime.includes('wav')) ext = 'wav';

          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
          this.pendingVoiceFile.set(file);
          this.pendingVoiceUrl.set(URL.createObjectURL(file));
        }
        this.cdr.markForCheck();
      };

      this.mediaRecorder.start(250);
      this.recording.set(true);
      this.recordingDuration.set(0);
      this.startRecordingTimer();
      this.cdr.markForCheck();
    } catch {
      this.toast.show('Microphone permission is required.', 'error');
      this.recording.set(false);
      this.cdr.markForCheck();
    }
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.recording()) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    this.recordedChunks = [];
    this.clearRecordingTimer();
    this.recording.set(false);
    this.clearPendingVoice();
    this.toast.show('Voice recording cancelled.');
    this.cdr.markForCheck();
  }

  private startRecordingTimer(): void {
    this.clearRecordingTimer();
    this.recordingTimer = setInterval(() => {
      const dur = this.recordingDuration() + 1;
      this.recordingDuration.set(dur);
      if (dur >= 120) {
        this.toggleRecording();
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = undefined;
    }
  }

  clearPendingVoice(): void {
    this.stopAudioPreview();
    const url = this.pendingVoiceUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.pendingVoiceUrl.set(null);
    this.pendingVoiceFile.set(null);
    this.cdr.markForCheck();
  }

  playPausePreview(): void {
    const url = this.pendingVoiceUrl();
    if (!url) return;

    if (!this.audioPreviewPlayer) {
      this.audioPreviewPlayer = new Audio(url);
      this.audioPreviewPlayer.onended = () => {
        this.isPlayingPreview.set(false);
        this.cdr.markForCheck();
      };
      this.audioPreviewPlayer.onerror = () => {
        this.isPlayingPreview.set(false);
        this.cdr.markForCheck();
      };
    }

    if (this.isPlayingPreview()) {
      this.audioPreviewPlayer.pause();
      this.isPlayingPreview.set(false);
    } else {
      this.audioPreviewPlayer.play().then(() => {
        this.isPlayingPreview.set(true);
      }).catch(() => {
        this.isPlayingPreview.set(false);
      });
    }
    this.cdr.markForCheck();
  }

  private stopAudioPreview(): void {
    if (this.audioPreviewPlayer) {
      this.audioPreviewPlayer.pause();
      this.audioPreviewPlayer.src = '';
      this.audioPreviewPlayer = undefined;
    }
    this.isPlayingPreview.set(false);
  }

  formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // --- Lightbox ---
  openLightbox(url: string): void {
    this.lightboxImageUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxImageUrl.set(null);
  }

  // --- Sending Flow ---
  sendMessage(): void {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }

    const voice = this.pendingVoiceFile();
    if (voice) {
      this.sendMedia(voice, 'audio');
      return;
    }

    const img = this.pendingImageFile();
    if (img) {
      this.sendMedia(img, 'image');
      return;
    }

    const doc = this.pendingDocFile();
    if (doc) {
      this.sendMedia(doc, 'document');
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
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.sending.set(false);
          this.toast.show(err?.error?.message || 'Failed to send message.', 'error');
          this.cdr.markForCheck();
        }
      });
    });
  }

  private sendMedia(file: File, type: 'image' | 'audio' | 'document'): void {
    if (this.sending()) return;
    this.sending.set(true);

    this.auth.ensureAccessToken().subscribe((token) => {
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
          if (type === 'image') this.clearPendingImage();
          if (type === 'audio') this.clearPendingVoice();
          if (type === 'document') this.clearPendingDoc();
          this.shouldScrollToBottom = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.sending.set(false);
          this.toast.show(err?.error?.message || 'Failed to send file.', 'error');
          this.cdr.markForCheck();
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
  }

  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${environment.apiBaseUrl}${url || ''}`;
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
