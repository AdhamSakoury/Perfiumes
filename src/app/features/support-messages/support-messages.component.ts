import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, effect, ElementRef, HostListener, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupportConversation, SupportMessage, User } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { SupportMessageService } from '@core/services/support-message.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CHAT_EMOJIS } from '@core/constants/emoji.constants';

@Component({
  selector: 'app-support-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './support-messages.component.html',
  styleUrl: './support-messages.component.css'
})
export class SupportMessagesComponent implements OnDestroy {
  @ViewChild('cameraCanvas') cameraCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('cameraFallbackInput') cameraFallbackInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraFallbackInputNew') cameraFallbackInputNew?: ElementRef<HTMLInputElement>;
  @ViewChild('cameraVideo') set cameraVideoRef(ref: ElementRef<HTMLVideoElement> | undefined) {
    this.cameraVideo = ref;
    if (ref?.nativeElement && this.cameraStream) {
      ref.nativeElement.srcObject = this.cameraStream;
      ref.nativeElement.play().catch(() => {});
    }
  }
  cameraVideo?: ElementRef<HTMLVideoElement>;

  conversations: SupportConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  newMessage = '';
  composing = false;
  loading = false;
  sending = false;
  creating = false;
  readonly apiBaseUrl = environment.apiBaseUrl;
  readonly emojiPickerOpen = signal(false);
  readonly chatEmojis = CHAT_EMOJIS;
  readonly recording = signal(false);
  readonly cameraOpen = signal(false);
  private cameraStream?: MediaStream;
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private sendVoiceAfterStop = false;
  pendingVoiceFile?: File;
  pendingInitialMedia?: { file: File; type: 'image' | 'audio' | 'document' };

  readonly quickReplies = [
    `"Uploaded the revised file"`,
    `"Can you check the status?"`,
    `"Thanks, resolving now"`
  ];

  constructor(
    readonly auth: AuthService,
    readonly support: SupportMessageService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    effect(() => {
      const items = this.support.conversations();
      this.conversations = items.map((c) => ({ ...c }));
      if (!this.selectedId && this.conversations.length && !this.composing) {
        this.selectedId = this.conversations[0].id;
      }
    });

    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/support' } });
      return;
    }

    this.support.connectForCurrentUser();
    this.conversations = this.support.conversations().map((c) => ({ ...c }));
    this.load(this.conversations.length === 0);
  }

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
    if (this.emojiPickerOpen() && target && !target.closest('.sd-emoji-wrap')) {
      this.emojiPickerOpen.set(false);
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.closeCamera();
  }

  async openCamera(): Promise<void> {
    if (this.sending || this.creating) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const input = this.composing ? this.cameraFallbackInputNew : this.cameraFallbackInput;
      input?.nativeElement?.click();
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
        const selected = this.selected;
        if (selected && !this.composing) {
          this.sendSupportMedia(selected.id, file, 'image');
        } else {
          this.pendingInitialMedia = { file, type: 'image' };
          this.toast.show('Photo attached. Type a message or click Send.', 'success');
        }
      }
    }, 'image/jpeg', 0.85);
  }

  get selected(): SupportConversation | null {
    if (this.composing) return null;
    return this.conversations.find((item) => item.id === this.selectedId) || null;
  }

  get hasInitialMedia(): boolean {
    return this.pendingInitialMedia !== undefined || this.pendingVoiceFile !== undefined;
  }

  load(showBusy = true): void {
    const user = this.auth.currentUser();
    if (!user) return;

    this.loading = showBusy && this.conversations.length === 0;
    this.support.getMyConversations(user.email).pipe(
      finalize(() => { this.loading = false; })
    ).subscribe({
      next: () => {
        if (!this.conversations.length) this.composing = true;
      },
      error: () => {
        this.toast.show('Could not load support messages.', 'error');
      }
    });
  }

  select(conversation: SupportConversation): void {
    this.selectedId = conversation.id;
    this.replyText = '';
    this.composing = false;
  }

  appendEmoji(emoji: string, textareaEl?: HTMLTextAreaElement): void {
    if (textareaEl) {
      const start = textareaEl.selectionStart ?? textareaEl.value.length;
      const end = textareaEl.selectionEnd ?? textareaEl.value.length;
      const val = textareaEl.value;
      textareaEl.value = val.slice(0, start) + emoji + val.slice(end);
      textareaEl.selectionStart = textareaEl.selectionEnd = start + emoji.length;
      textareaEl.focus();
      if (this.composing) {
        this.newMessage = textareaEl.value;
      } else {
        this.replyText = textareaEl.value;
      }
    } else {
      if (this.composing) {
        this.newMessage = (this.newMessage || '') + emoji;
      } else {
        this.replyText = (this.replyText || '') + emoji;
      }
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  clearPendingMedia(): void {
    this.pendingInitialMedia = undefined;
    this.pendingVoiceFile = undefined;
    this.cdr.markForCheck();
  }

  applyQuickReply(text: string): void {
    this.replyText = text;
  }

  startNewMessage(): void {
    this.composing = true;
    this.selectedId = null;
    this.replyText = '';
    this.newMessage = '';
    this.pendingInitialMedia = undefined;
    this.pendingVoiceFile = undefined;
    this.cdr.markForCheck();
  }

  createConversation(): void {
    const user = this.auth.currentUser();
    const body = this.newMessage.trim();
    const initialMedia = this.pendingInitialMedia || (this.pendingVoiceFile ? { file: this.pendingVoiceFile, type: 'audio' as const } : undefined);
    const subject = this.buildSubject(body);
    if (!user || (!body && !initialMedia) || this.creating) return;

    const messageText = body || (initialMedia?.type === 'image' ? '📷 Image' : '🎤 Voice note');
    const tempConversation = this.tempConversation(user, messageText, subject);
    this.support.upsertConversation(tempConversation);
    this.selectedId = tempConversation.id;
    this.newMessage = '';
    this.pendingInitialMedia = undefined;
    this.pendingVoiceFile = undefined;
    this.composing = false;
    this.creating = true;
    this.cdr.markForCheck();

    this.support.createConversation(user, messageText, subject).pipe(
      timeout(10000),
      finalize(() => { this.creating = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: (conversation) => {
        this.support.removeConversation(tempConversation.id);
        this.selectedId = conversation.id;
        if (initialMedia) {
          this.sendSupportMedia(conversation.id, initialMedia.file, initialMedia.type);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.support.removeConversation(tempConversation.id);
        this.composing = true;
        this.newMessage = body;
        this.toast.show('Could not contact the admin.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  send(): void {
    const user = this.auth.currentUser();
    const selected = this.selected;
    if (this.recording()) {
      this.sendVoiceAfterStop = true;
      this.mediaRecorder?.stop();
      return;
    }
    if (this.pendingVoiceFile && selected) {
      this.sendSupportMedia(selected.id, this.pendingVoiceFile, 'audio');
      return;
    }
    const body = this.replyText.trim();
    if (!user || !selected || !body || this.sending || selected.status === 'closed') return;

    this.replyText = '';
    this.sending = true;
    this.support.upsertConversation(this.withTempMessage(selected, user.fullName, user.email, 'customer', body, 'open'));
    this.support.addCustomerMessage(selected.id, user, body).pipe(
      timeout(10000),
      finalize(() => { this.sending = false; })
    ).subscribe({
      next: () => undefined,
      error: () => {
        this.support.upsertConversation(selected);
        this.replyText = body;
        this.toast.show('Could not send message.', 'error');
      }
    });
  }

  onMediaSelected(event: Event, type: 'image' | 'document'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const selected = this.selected;
    if (selected) {
      this.sendSupportMedia(selected.id, file, type);
    } else if (this.composing) {
      this.pendingInitialMedia = { file, type };
    }
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
        const selected = this.selected;
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          this.pendingVoiceFile = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
        }
        this.recording.set(false);
        if (this.sendVoiceAfterStop && this.pendingVoiceFile && selected) {
          this.sendVoiceAfterStop = false;
          this.sendSupportMedia(selected.id, this.pendingVoiceFile, 'audio');
          this.pendingVoiceFile = undefined;
        }
        this.cdr.markForCheck();
      };
      this.mediaRecorder.start(250);
      this.recording.set(true);
      this.cdr.markForCheck();
    } catch {
      this.toast.show('Microphone permission is required.', 'error');
      this.cdr.markForCheck();
    }
  }

  private sendSupportMedia(conversationId: string, file: File, type: 'image' | 'audio' | 'document'): void {
    if (this.sending) return;
    this.sending = true;
    const token = this.auth.currentAccessToken() || '';
    this.support.sendCustomerMedia(conversationId, file, type, token).pipe(
      finalize(() => { this.sending = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: (conversation) => {
        this.support.upsertConversation(conversation);
        this.pendingVoiceFile = undefined;
        this.pendingInitialMedia = undefined;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.show(err?.error?.message || 'Could not send file.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${this.apiBaseUrl}${url || ''}`;
  }

  private buildSubject(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Support request';
    return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
  }

  private tempConversation(user: User, body: string, subject: string): SupportConversation {
    const now = new Date().toISOString();
    const id = `pending_${Date.now()}`;
    return {
      id,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      subject,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      messages: [this.tempMessage(id, user.fullName, user.email, 'customer', body)]
    };
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
      messages: [...conversation.messages, this.tempMessage(conversation.id, senderName, senderEmail, senderRole, body)]
    };
  }

  private tempMessage(conversationId: string, senderName: string, senderEmail: string, senderRole: string, body: string): SupportMessage {
    return {
      id: `pending_msg_${Date.now()}`,
      conversationId,
      senderRole,
      senderName,
      senderEmail,
      body,
      createdAt: new Date().toISOString()
    };
  }
}
