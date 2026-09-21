import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, effect, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CHAT_EMOJIS } from '@core/constants/emoji.constants';
import { SupportConversation, SupportMessage } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { SupportMessageService } from '@core/services/support-message.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { environment } from '../../../../environments/environment';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, switchMap, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './admin-messages.component.html',
  styleUrl: './admin-messages.component.css'
})
export class AdminMessagesComponent implements OnDestroy {
  readonly apiBaseUrl = environment.apiBaseUrl;
  conversations: SupportConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  loading = false;
  replying = false;
  tokenLoading = false;
  loadError = '';

  // Media signals and states
  readonly emojiPickerOpen = signal(false);
  readonly chatEmojis = CHAT_EMOJIS;
  readonly uploadingMedia = signal(false);
  readonly lightboxImageUrl = signal<string | null>(null);

  // Camera capture states
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
  readonly cameraOpen = signal(false);
  readonly capturedPhotoUrl = signal<string | null>(null);
  private cameraStream?: MediaStream;
  private pendingCapturedFile?: File;

  // Staged image
  readonly pendingImageFile = signal<File | null>(null);
  readonly pendingImageUrl = signal<string | null>(null);

  // Voice recording
  readonly recording = signal(false);
  readonly recordingDuration = signal(0);
  readonly pendingVoiceFile = signal<File | null>(null);
  readonly pendingVoiceUrl = signal<string | null>(null);
  readonly isPlayingPreview = signal(false);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private recordingTimer?: any;
  private audioPreviewPlayer?: HTMLAudioElement;

  constructor(
    readonly auth: AuthService,
    private readonly support: SupportMessageService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService,
    private readonly cdr: ChangeDetectorRef
  ) {
    effect(() => {
      const items = this.support.conversations();
      if (!items.length) return;
      this.applyConversations(items);
    });

    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/messages' } });
      return;
    }

    this.support.connectForCurrentUser();
    this.applyConversations(this.support.conversations());
    this.refreshConversations(this.conversations.length === 0);
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get selected(): SupportConversation | null {
    return this.conversations.find((item) => item.id === this.selectedId) || this.conversations[0] || null;
  }

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
    if (this.emojiPickerOpen() && target && !target.closest('.admin-emoji-wrap')) {
      this.emojiPickerOpen.set(false);
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.closeCamera();
    this.clearRecordingTimer();
    this.stopAudioPreview();
    this.clearPendingImage();
    this.clearPendingVoice();
  }

  load(): void {
    this.refreshConversations(true);
  }

  private refreshConversations(showBusy = true): void {
    if (!this.isAdmin) return;
    this.loading = showBusy;
    this.loadError = '';

    const token = this.auth.currentAccessToken();
    const fetchConvs = (t: string) => this.support.getAdminConversations(t).pipe(
      timeout(10000),
      finalize(() => {
        this.loading = false;
      })
    );

    if (token) {
      fetchConvs(token).subscribe({
        next: (items) => {
          this.applyConversations(items);
        },
        error: (err) => {
          this.auth.refreshAdminAccessToken().pipe(
            switchMap((freshToken) => freshToken ? fetchConvs(freshToken) : throwError(() => err))
          ).subscribe({
            next: (items) => {
              this.applyConversations(items);
            },
            error: () => {
              this.loadError = this.i18n.t('supportMessagesLoadFailed');
              this.toast.show(this.loadError, 'error');
            }
          });
        }
      });
      return;
    }

    this.auth.ensureAccessToken().pipe(
      switchMap((freshToken) => freshToken ? fetchConvs(freshToken) : throwError(() => new Error('No admin token'))),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (items) => {
        this.applyConversations(items);
      },
      error: () => {
        this.loadError = this.i18n.t('supportMessagesLoadFailed');
        this.toast.show(this.loadError, 'error');
      }
    });
  }

  select(conversation: SupportConversation): void {
    this.selectedId = conversation.id;
    this.replyText = '';
    this.clearPendingImage();
    this.clearPendingVoice();
  }

  appendEmoji(emoji: string, textareaEl?: HTMLTextAreaElement): void {
    if (textareaEl) {
      const start = textareaEl.selectionStart ?? textareaEl.value.length;
      const end = textareaEl.selectionEnd ?? textareaEl.value.length;
      const val = textareaEl.value;
      textareaEl.value = val.slice(0, start) + emoji + val.slice(end);
      textareaEl.selectionStart = textareaEl.selectionEnd = start + emoji.length;
      textareaEl.focus();
      this.replyText = textareaEl.value;
    } else {
      this.replyText = (this.replyText || '') + emoji;
    }
    this.cdr.markForCheck();
  }

  // --- Image Upload & Staging ---
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toast.show('Please select a valid image file.', 'error');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      this.toast.show('Image size exceeds 15 MB limit.', 'error');
      return;
    }

    this.clearPendingImage();
    this.pendingImageFile.set(file);
    const objectUrl = URL.createObjectURL(file);
    this.pendingImageUrl.set(objectUrl);
    this.cdr.markForCheck();
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

  // --- Camera Photo Capture ---
  async openCamera(): Promise<void> {
    if (this.replying || this.uploadingMedia()) return;

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
      console.warn('Camera access denied/failed:', err);
      this.toast.show('Camera access denied or unavailable. Please allow camera permissions.', 'error');
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
        const file = new File([blob], `admin-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
      this.toast.show('Voice recording is not supported by your browser.', 'error');
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
          const file = new File([blob], `admin-voice-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
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
      this.toast.show('Microphone access denied or unavailable.', 'error');
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

  // --- Lightbox Preview ---
  openLightbox(url: string): void {
    this.lightboxImageUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxImageUrl.set(null);
  }

  // --- Sending Flow ---
  sendCurrentReply(): void {
    const selected = this.selected;
    if (!selected || selected.status === 'closed') return;

    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }

    const pendingVoice = this.pendingVoiceFile();
    if (pendingVoice) {
      this.sendMedia(pendingVoice, 'audio');
      return;
    }

    const pendingImg = this.pendingImageFile();
    if (pendingImg) {
      this.sendMedia(pendingImg, 'image');
      return;
    }

    this.reply();
  }

  private sendMedia(file: File, type: 'image' | 'audio' | 'document'): void {
    const selected = this.selected;
    if (!selected || this.uploadingMedia() || selected.status === 'closed') return;

    this.uploadingMedia.set(true);
    this.adminRequest((token) => this.support.sendAdminMedia(selected.id, file, type, token)).subscribe({
      next: (updated) => {
        this.replaceConversation(updated);
        this.uploadingMedia.set(false);
        if (type === 'image') this.clearPendingImage();
        if (type === 'audio') this.clearPendingVoice();
        this.toast.show('Media sent successfully.', 'success');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.uploadingMedia.set(false);
        this.toast.show(err?.error?.message || 'Failed to upload media.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  reply(): void {
    const selected = this.selected;
    const user = this.auth.currentUser();
    const body = this.replyText.trim();
    if (!selected || !user || !body || this.replying || selected.status === 'closed') return;

    this.support.upsertConversation(this.withTempMessage(selected, 'Gnouby Admin', user.email, 'admin', body, 'answered'));
    this.replyText = '';
    this.replying = true;
    this.adminRequest((token) => this.support.replyAsAdmin(selected.id, body, token)).subscribe({
      next: (updated) => {
        this.replaceConversation(updated);
        this.replying = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.support.upsertConversation(selected);
        this.replyText = body;
        this.replying = false;
        this.toast.show(this.i18n.t('replyFailed'), 'error');
        this.cdr.markForCheck();
      }
    });
  }

  closeSelected(): void {
    const selected = this.selected;
    if (!selected) return;

    this.adminRequest((token) => this.support.closeConversation(selected.id, token)).subscribe({
      next: (updated) => this.replaceConversation(updated),
      error: () => this.toast.show(this.i18n.t('conversationCloseFailed'), 'error')
    });
  }

  private replaceConversation(updated: SupportConversation): void {
    this.selectedId = updated.id;
  }

  private applyConversations(items: SupportConversation[]): void {
    this.conversations = items;
    if (!this.selectedId || !items.some((item) => item.id === this.selectedId)) {
      this.selectedId = items[0]?.id ?? null;
    }
  }

  private withTempMessage(
    conversation: SupportConversation,
    senderName: string,
    senderEmail: string,
    senderRole: string,
    body: string,
    status: string
  ): SupportConversation {
    return {
      ...conversation,
      status,
      updatedAt: new Date().toISOString(),
      messages: [
        ...conversation.messages,
        {
          id: `pending_msg_${Date.now()}`,
          conversationId: conversation.id,
          senderRole,
          senderName,
          senderEmail,
          body,
          createdAt: new Date().toISOString()
        } satisfies SupportMessage
      ]
    };
  }

  private adminRequest<T>(request: (token: string) => Observable<T>): Observable<T> {
    const currentToken = this.auth.currentAccessToken();
    if (currentToken) return request(currentToken).pipe(catchError((error) => this.retryWithFreshToken(error, request)));

    this.tokenLoading = true;
    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => {
        this.tokenLoading = false;
        return token ? request(token) : throwError(() => new Error('No admin token'));
      }),
      catchError((error) => {
        this.tokenLoading = false;
        return throwError(() => error);
      })
    );
  }

  private retryWithFreshToken<T>(error: unknown, request: (token: string) => Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
      return throwError(() => error);
    }

    this.tokenLoading = true;
    return this.auth.refreshAdminAccessToken().pipe(
      switchMap((token) => {
        this.tokenLoading = false;
        return token ? request(token) : throwError(() => error);
      }),
      catchError((refreshError) => {
        this.tokenLoading = false;
        this.loading = false;
        this.replying = false;
        this.loadError = this.i18n.t('loginAgainAdmin');
        this.toast.show(this.i18n.t('loginAgainAdmin'), 'error');
        return throwError(() => refreshError);
      })
    );
  }

  statusLabel(status: string): string {
    const key = `conversationStatus_${status}`;
    const translated = this.i18n.t(key);
    return translated === key ? status : translated;
  }

  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${this.apiBaseUrl}${url || ''}`;
  }
}
