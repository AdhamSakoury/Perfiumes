import { DatePipe } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  HostListener,
  OnDestroy,
  signal,
  ViewChild
} from '@angular/core';
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

  // ── Camera refs ──────────────────────────────────────────────────
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

  // ── Component state ──────────────────────────────────────────────
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

  // ── Camera signals ───────────────────────────────────────────────
  readonly cameraOpen = signal(false);
  readonly capturedPhotoUrl = signal<string | null>(null);  // null = live, string = snapped
  private capturedBlob?: Blob;
  private cameraStream?: MediaStream;

  // ── Voice recording signals ──────────────────────────────────────
  readonly recording = signal(false);
  readonly recordingSecs = signal(0);
  readonly pendingVoiceUrl = signal<string | null>(null);  // preview URL
  readonly voicePlaying = signal(false);

  // ── Staged image/document ────────────────────────────────────────
  readonly stagedImage = signal<{ file: File; previewUrl: string } | null>(null);
  readonly stagedDoc   = signal<File | null>(null);

  // ── Lightbox ─────────────────────────────────────────────────────
  readonly lightboxUrl = signal<string | null>(null);

  // ── Pending for new-conversation flow ────────────────────────────
  pendingInitialMedia?: { file: File; type: 'image' | 'audio' | 'document' };

  // ── Voice internals ──────────────────────────────────────────────
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private recordingTimer?: ReturnType<typeof setInterval>;
  private voiceAudioEl?: HTMLAudioElement;
  private pendingVoiceFile?: File;

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

  // ── Keyboard / click-outside ──────────────────────────────────────
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.lightboxUrl()) { this.lightboxUrl.set(null); return; }
    if (this.cameraOpen()) { this.closeCamera(); return; }
    if (this.emojiPickerOpen()) { this.emojiPickerOpen.set(false); this.cdr.markForCheck(); }
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
    this.clearRecordingTimer();
    this.voiceAudioEl?.pause();
    this.revokeStaged();
  }

  // ── Getters ───────────────────────────────────────────────────────
  get selected(): SupportConversation | null {
    if (this.composing) return null;
    return this.conversations.find((item) => item.id === this.selectedId) || null;
  }

  get hasInitialMedia(): boolean {
    return this.pendingInitialMedia !== undefined || this.pendingVoiceFile !== undefined;
  }

  get recordingTime(): string {
    const s = this.recordingSecs();
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ── Load / select ─────────────────────────────────────────────────
  load(showBusy = true): void {
    const user = this.auth.currentUser();
    if (!user) return;
    this.loading = showBusy && this.conversations.length === 0;
    this.support.getMyConversations(user.email).pipe(
      finalize(() => { this.loading = false; })
    ).subscribe({
      next: () => { if (!this.conversations.length) this.composing = true; },
      error: () => { this.toast.show('Could not load support messages.', 'error'); }
    });
  }

  select(conversation: SupportConversation): void {
    this.selectedId = conversation.id;
    this.replyText = '';
    this.composing = false;
  }

  startNewMessage(): void {
    this.composing = true;
    this.selectedId = null;
    this.replyText = '';
    this.newMessage = '';
    this.pendingInitialMedia = undefined;
    this.clearPendingVoice();
    this.revokeStaged();
    this.stagedImage.set(null);
    this.stagedDoc.set(null);
    this.cdr.markForCheck();
  }

  // ── Emoji ─────────────────────────────────────────────────────────
  appendEmoji(emoji: string, textareaEl?: HTMLTextAreaElement): void {
    if (textareaEl) {
      const start = textareaEl.selectionStart ?? textareaEl.value.length;
      const end   = textareaEl.selectionEnd   ?? textareaEl.value.length;
      const val   = textareaEl.value;
      textareaEl.value = val.slice(0, start) + emoji + val.slice(end);
      textareaEl.selectionStart = textareaEl.selectionEnd = start + emoji.length;
      textareaEl.focus();
      if (this.composing) { this.newMessage  = textareaEl.value; }
      else                { this.replyText   = textareaEl.value; }
    } else {
      if (this.composing) { this.newMessage  = (this.newMessage  || '') + emoji; }
      else                { this.replyText   = (this.replyText   || '') + emoji; }
    }
    this.cdr.markForCheck();
    this.cdr.detectChanges();
  }

  applyQuickReply(text: string): void {
    this.replyText = text;
  }

  // ── Lightbox ──────────────────────────────────────────────────────
  openLightbox(url: string): void { this.lightboxUrl.set(url); }
  closeLightbox(): void           { this.lightboxUrl.set(null); }

  // ── Staged image ──────────────────────────────────────────────────
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.revokeStaged();
    const previewUrl = URL.createObjectURL(file);
    this.stagedImage.set({ file, previewUrl });
    this.stagedDoc.set(null);
    this.cdr.markForCheck();
  }

  cancelStagedImage(): void {
    this.revokeStaged();
    this.stagedImage.set(null);
    this.cdr.markForCheck();
  }

  sendStagedImage(): void {
    const staged = this.stagedImage();
    if (!staged) return;
    const selected = this.selected;
    if (selected) {
      this.cancelStagedImage();
      this.sendSupportMedia(selected.id, staged.file, 'image');
    } else if (this.composing) {
      this.pendingInitialMedia = { file: staged.file, type: 'image' };
      this.cancelStagedImage();
      this.cdr.markForCheck();
    }
  }

  // ── Staged document ───────────────────────────────────────────────
  onDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.stagedDoc.set(file);
    this.stagedImage.set(null);
    this.cdr.markForCheck();
  }

  cancelStagedDoc(): void {
    this.stagedDoc.set(null);
    this.cdr.markForCheck();
  }

  sendStagedDoc(): void {
    const doc = this.stagedDoc();
    if (!doc) return;
    const selected = this.selected;
    if (selected) {
      this.cancelStagedDoc();
      this.sendSupportMedia(selected.id, doc, 'document');
    } else if (this.composing) {
      this.pendingInitialMedia = { file: doc, type: 'document' };
      this.cancelStagedDoc();
      this.cdr.markForCheck();
    }
  }

  clearPendingInitialMedia(): void {
    this.pendingInitialMedia = undefined;
    this.cdr.markForCheck();
  }

  // ── Camera ────────────────────────────────────────────────────────
  async openCamera(): Promise<void> {
    if (this.sending || this.creating) return;

    if (!navigator.mediaDevices?.getUserMedia) {
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
      this.capturedPhotoUrl.set(null);
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

  capturePhoto(): void {
    const video  = this.cameraVideo?.nativeElement;
    const canvas = this.cameraCanvas?.nativeElement;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      this.capturedBlob = blob;
      const url = URL.createObjectURL(blob);
      this.capturedPhotoUrl.set(url);
      // Pause live stream visually — stream tracks stay active for retake
      this.cameraVideo?.nativeElement.pause();
      this.cdr.markForCheck();
    }, 'image/jpeg', 0.85);
  }

  retakePhoto(): void {
    // Revoke preview URL and return to live feed
    const prev = this.capturedPhotoUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.capturedBlob = undefined;
    this.capturedPhotoUrl.set(null);
    // Resume live feed
    this.cameraVideo?.nativeElement.play().catch(() => {});
    this.cdr.markForCheck();
  }

  confirmPhoto(): void {
    if (!this.capturedBlob) return;
    const file = new File([this.capturedBlob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    // Revoke preview URL
    const prev = this.capturedPhotoUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.capturedBlob  = undefined;
    this.capturedPhotoUrl.set(null);
    this.closeCamera();

    const selected = this.selected;
    if (selected && !this.composing) {
      // Stage it so user can preview and cancel
      const previewUrl = URL.createObjectURL(file);
      this.stagedImage.set({ file, previewUrl });
      this.cdr.markForCheck();
    } else if (this.composing) {
      this.pendingInitialMedia = { file, type: 'image' };
      this.toast.show('Photo attached. Send your message to include it.', 'success');
      this.cdr.markForCheck();
    }
  }

  closeCamera(): void {
    const prev = this.capturedPhotoUrl();
    if (prev) URL.revokeObjectURL(prev);
    this.capturedPhotoUrl.set(null);
    this.capturedBlob = undefined;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((track) => track.stop());
      this.cameraStream = undefined;
    }
    this.cameraOpen.set(false);
  }

  // ── Voice recording ───────────────────────────────────────────────
  toggleRecording(): void {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }
    this.clearPendingVoice();
    void this.beginRecording();
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.recording()) {
      this.mediaRecorder.onstop = null;   // suppress onstop handler
      this.mediaRecorder.stop();
      this.mediaRecorder.stream?.getTracks().forEach((t) => t.stop());
    }
    this.recordedChunks = [];
    this.clearRecordingTimer();
    this.recording.set(false);
    this.clearPendingVoice();
    this.toast.show('Voice recording cancelled.');
    this.cdr.markForCheck();
  }

  toggleVoicePlayback(): void {
    const url = this.pendingVoiceUrl();
    if (!url) return;
    if (!this.voiceAudioEl) {
      this.voiceAudioEl = new Audio(url);
      this.voiceAudioEl.onended = () => { this.voicePlaying.set(false); this.cdr.markForCheck(); };
    }
    if (this.voicePlaying()) {
      this.voiceAudioEl.pause();
      this.voicePlaying.set(false);
    } else {
      void this.voiceAudioEl.play();
      this.voicePlaying.set(true);
    }
    this.cdr.markForCheck();
  }

  sendPendingVoice(): void {
    if (!this.pendingVoiceFile) return;
    const selected = this.selected;
    if (selected) {
      const file = this.pendingVoiceFile;
      this.clearPendingVoice();
      this.sendSupportMedia(selected.id, file, 'audio');
    } else if (this.composing) {
      this.pendingInitialMedia = { file: this.pendingVoiceFile, type: 'audio' };
      this.clearPendingVoice();
      this.cdr.markForCheck();
    }
  }

  clearPendingVoice(): void {
    this.voiceAudioEl?.pause();
    this.voiceAudioEl = undefined;
    const url = this.pendingVoiceUrl();
    if (url) URL.revokeObjectURL(url);
    this.pendingVoiceUrl.set(null);
    this.pendingVoiceFile = undefined;
    this.voicePlaying.set(false);
    this.cdr.markForCheck();
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
        .find((c) => MediaRecorder.isTypeSupported(c));
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        this.clearRecordingTimer();
        this.recording.set(false);
        if (this.recordedChunks.length > 0) {
          const blob      = new Blob(this.recordedChunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const file      = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type });
          this.pendingVoiceFile = file;
          const previewUrl = URL.createObjectURL(blob);
          this.pendingVoiceUrl.set(previewUrl);
          this.voiceAudioEl = new Audio(previewUrl);
          this.voiceAudioEl.onended = () => { this.voicePlaying.set(false); this.cdr.markForCheck(); };
        }
        this.cdr.markForCheck();
      };

      this.mediaRecorder.start(250);
      this.recording.set(true);
      this.recordingSecs.set(0);
      this.startRecordingTimer();
      this.cdr.markForCheck();
    } catch {
      this.toast.show('Microphone permission is required.', 'error');
      this.cdr.markForCheck();
    }
  }

  private startRecordingTimer(): void {
    this.clearRecordingTimer();
    this.recordingTimer = setInterval(() => {
      const next = this.recordingSecs() + 1;
      this.recordingSecs.set(next);
      this.cdr.markForCheck();
      if (next >= 120) {
        this.mediaRecorder?.stop();
      }
    }, 1000);
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = undefined;
    }
  }

  // ── Send text ────────────────────────────────────────────────────
  send(): void {
    const user     = this.auth.currentUser();
    const selected = this.selected;
    const body     = this.replyText.trim();
    if (!user || !selected || !body || this.sending || selected.status === 'closed') return;

    this.replyText = '';
    this.sending   = true;
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

  createConversation(): void {
    const user         = this.auth.currentUser();
    const body         = this.newMessage.trim();
    const initialMedia = this.pendingInitialMedia
      || (this.pendingVoiceFile ? { file: this.pendingVoiceFile, type: 'audio' as const } : undefined);
    const subject      = this.buildSubject(body);
    if (!user || (!body && !initialMedia) || this.creating) return;

    const messageText    = body || (initialMedia?.type === 'image' ? '📷 Image' : initialMedia?.type === 'audio' ? '🎤 Voice note' : '📎 Document');
    const tempConversation = this.tempConversation(user, messageText, subject);
    this.support.upsertConversation(tempConversation);
    this.selectedId          = tempConversation.id;
    this.newMessage          = '';
    this.pendingInitialMedia = undefined;
    this.pendingVoiceFile    = undefined;
    this.composing           = false;
    this.creating            = true;
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
        this.composing  = true;
        this.newMessage = body;
        this.toast.show('Could not contact the admin.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  // ── Media send ────────────────────────────────────────────────────
  private sendSupportMedia(conversationId: string, file: File, type: 'image' | 'audio' | 'document'): void {
    if (this.sending) return;
    this.sending = true;
    const token  = this.auth.currentAccessToken() || '';
    this.support.sendCustomerMedia(conversationId, file, type, token).pipe(
      finalize(() => { this.sending = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: (conversation) => {
        this.support.upsertConversation(conversation);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toast.show(err?.error?.message || 'Could not send file.', 'error');
        this.cdr.markForCheck();
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────
  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${this.apiBaseUrl}${url || ''}`;
  }

  private revokeStaged(): void {
    const s = this.stagedImage();
    if (s?.previewUrl) URL.revokeObjectURL(s.previewUrl);
  }

  private buildSubject(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Support request';
    return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
  }

  private tempConversation(user: User, body: string, subject: string): SupportConversation {
    const now = new Date().toISOString();
    const id  = `pending_${Date.now()}`;
    return {
      id,
      userId:    user.id,
      userName:  user.fullName,
      userEmail: user.email,
      subject,
      status:    'open',
      createdAt: now,
      updatedAt: now,
      messages:  [this.tempMessage(id, user.fullName, user.email, 'customer', body)]
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

  private tempMessage(
    conversationId: string,
    senderName: string,
    senderEmail: string,
    senderRole: string,
    body: string
  ): SupportMessage {
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
