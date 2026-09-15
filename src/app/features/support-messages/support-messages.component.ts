import { DatePipe } from '@angular/common';
import { Component, effect, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OrderConversation, SupportConversation, SupportMessage, User } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { OrderService } from '@core/services/order.service';
import { OrderTrackingService } from '@core/services/order-tracking.service';
import { SupportMessageService } from '@core/services/support-message.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, forkJoin, of, timeout } from 'rxjs';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CHAT_EMOJIS } from '@core/constants/emoji.constants';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

type MessageConversation = (SupportConversation & { kind: 'support'; orderId?: never })
  | (SupportConversation & { kind: 'order'; orderId: string });

@Component({
  selector: 'app-support-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './support-messages.component.html',
  styleUrl: './support-messages.component.css'
})
export class SupportMessagesComponent implements OnDestroy {
  readonly orderOnlyMode: boolean;
  conversations: MessageConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  newMessage = '';
  composing = false;
  loading = false;
  sending = false;
  creating = false;
  private orderConversations: MessageConversation[] = [];
  readonly apiBaseUrl = environment.apiBaseUrl;
  readonly orderEmojiPickerOpen = signal(false);
  readonly chatEmojis = CHAT_EMOJIS;
  readonly recording = signal(false);
  private mediaRecorder?: MediaRecorder;
  private recordedChunks: Blob[] = [];
  private voicePointerActive = false;
  private voiceCancelRequested = false;
  private voiceStartX = 0;
  private sendVoiceAfterStop = false;
  pendingVoiceFile?: File;
  private pendingInitialMedia?: { file: File; type: 'image' | 'audio' | 'document' };
  private orderMessageSub?: Subscription;

  constructor(
    readonly auth: AuthService,
    readonly support: SupportMessageService,
    readonly i18n: LocalizationService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly ordersApi: OrderService,
    private readonly route: ActivatedRoute,
    private readonly trackingService: OrderTrackingService
  ) {
    this.orderOnlyMode = this.route.snapshot.routeConfig?.path === 'messages';
    this.orderMessageSub = this.trackingService.message$.subscribe((message) => {
      const conversation = this.orderConversations.find((item) =>
        item.kind === 'order' && item.orderId != null && item.orderId.toLowerCase() === message.orderId.toLowerCase());
      if (!conversation || conversation.messages.some((item) => item.id === message.id)) return;

      this.orderConversations = this.orderConversations.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              updatedAt: message.createdAt,
              messages: [...item.messages, this.toSupportMessage(message)]
            }
          : item);
      this.conversations = this.combineConversations(this.support.conversations(), this.orderConversations);
    });

    effect(() => {
      this.conversations = this.combineConversations(this.support.conversations(), this.orderConversations);
      if (!this.selectedId && this.conversations.length && !this.composing) this.selectedId = this.conversations[0].id;
    });

    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: this.orderOnlyMode ? '/messages' : '/support' } });
      return;
    }

    if (!this.orderOnlyMode) {
      this.support.connectForCurrentUser();
    }
    this.conversations = this.combineConversations(this.support.conversations(), this.orderConversations);
    this.load(this.conversations.length === 0);
  }

  ngOnDestroy(): void {
    this.orderMessageSub?.unsubscribe();
    for (const conversation of this.orderConversations) {
      if (conversation.kind === 'order' && conversation.orderId != null) {
        this.trackingService.leaveOrder(conversation.orderId);
      }
    }
  }

  get selected(): MessageConversation | null {
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
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.loading = false;
        return;
      }

      forkJoin({
        support: this.orderOnlyMode ? of([] as SupportConversation[]) : this.support.getMyConversations(user.email),
        orders: this.orderOnlyMode ? this.ordersApi.getOrderConversations(token) : of([])
      }).subscribe({
      next: ({ support, orders }) => {
        const latestOrders = orders.map((conversation) => this.toMessageConversation(conversation));
        this.orderConversations = latestOrders.map((latest) => {
          const current = this.orderConversations.find((item) => item.id === latest.id);
          if (!current || current.kind !== 'order') return latest;

          const messages = [...current.messages, ...latest.messages]
            .filter((message, index, list) => list.findIndex((item) => item.id === message.id) === index)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return { ...latest, messages, updatedAt: messages.at(-1)?.createdAt || latest.updatedAt };
        });
        for (const conversation of this.orderConversations) {
          if (conversation.kind === 'order' && conversation.orderId != null) {
            this.trackingService.joinOrder(conversation.orderId);
          }
        }
        this.conversations = this.combineConversations(support, this.orderConversations);
        const requestedOrderId = this.route.snapshot.queryParamMap.get('orderId');
        if (requestedOrderId && this.orderConversations.some((item) => item.orderId === requestedOrderId)) {
          this.selectedId = `order_${requestedOrderId}`;
          this.composing = false;
        } else if (!this.selectedId && this.conversations.length) {
          this.selectedId = this.conversations[0].id;
          this.composing = false;
        }
        if (!this.conversations.length) this.composing = true;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.show('Could not load messages.', 'error');
      }
      });
    });
  }

  select(conversation: MessageConversation): void {
    this.selectedId = conversation.id;
    this.replyText = '';
    this.composing = false;
  }

  appendOrderEmoji(emoji: string): void {
    this.replyText += emoji;
    this.orderEmojiPickerOpen.set(false);
  }

  appendNewMessageEmoji(emoji: string): void {
    this.newMessage += emoji;
    this.orderEmojiPickerOpen.set(false);
  }

  startNewMessage(): void {
    this.composing = true;
    this.selectedId = null;
    this.replyText = '';
    this.newMessage = '';
  }

  createConversation(): void {
    const user = this.auth.currentUser();
    const body = this.newMessage.trim();
    const initialMedia = this.pendingInitialMedia || (this.pendingVoiceFile ? { file: this.pendingVoiceFile, type: 'audio' as const } : undefined);
    const subject = this.buildSubject(body);
    if (!user || (!body && !initialMedia) || this.creating) return;
    const initialBody = body || (initialMedia?.type === 'image' ? '📷 Image' : '🎤 Voice note');

    const tempConversation = this.tempConversation(user, initialBody, subject);
    this.support.upsertConversation(tempConversation);
    this.selectedId = tempConversation.id;
    this.newMessage = '';
    this.pendingInitialMedia = undefined;
    this.pendingVoiceFile = undefined;
    this.composing = false;
    this.creating = true;
    this.support.createConversation(user, body, subject).pipe(
      timeout(10000),
      finalize(() => {
        this.creating = false;
      })
    ).subscribe({
      next: (conversation) => {
        this.support.removeConversation(tempConversation.id);
        this.selectedId = conversation.id;
        if (initialMedia) {
          this.sendSupportMedia(conversation.id, initialMedia.file, initialMedia.type);
        }
      },
      error: () => {
        this.support.removeConversation(tempConversation.id);
        this.composing = true;
        this.newMessage = body;
        this.toast.show('Could not contact the admin.', 'error');
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
    const body = this.replyText.trim();
    if (this.pendingVoiceFile) {
      if (selected?.kind === 'order') this.sendPendingVoice();
      else if (selected?.kind === 'support') this.sendSupportMedia(selected.id, this.pendingVoiceFile, 'audio');
      return;
    }
    if (!user || !selected || !body || this.sending || selected.status === 'closed') return;

    this.replyText = '';
    this.sending = true;
    if (selected.kind === 'order') {
      this.auth.ensureAccessToken().subscribe((token) => {
        if (!token) {
          this.sending = false;
          this.replyText = body;
          return;
        }

        this.ordersApi.sendOrderMessage(selected.orderId, body, token).pipe(
          timeout(10000),
          finalize(() => this.sending = false)
        ).subscribe({
          next: (message) => {
            this.orderConversations = this.orderConversations.map((conversation) =>
              conversation.id === selected.id
                ? { ...conversation, updatedAt: message.createdAt, messages: [...conversation.messages, this.toSupportMessage(message)] }
                : conversation);
            this.conversations = this.combineConversations(this.support.conversations(), this.orderConversations);
          },
          error: () => {
            this.replyText = body;
            this.toast.show('Could not send message.', 'error');
          }
        });
      });
      return;
    }

    this.support.upsertConversation(this.withTempMessage(selected, user.fullName, user.email, 'customer', body, 'open'));
    this.support.addCustomerMessage(selected.id, user, body).pipe(
      timeout(10000),
      finalize(() => {
        this.sending = false;
      })
    ).subscribe({
      next: () => undefined,
      error: () => {
        this.support.upsertConversation(selected);
        this.replyText = body;
        this.toast.show('Could not send message.', 'error');
      }
    });
  }

  onOrderMediaSelected(event: Event, type: 'image' | 'document'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const selected = this.selected;
    if (file && selected?.kind === 'order') this.sendOrderMedia(selected.orderId, file, type);
  }

  onSupportMediaSelected(event: Event, type: 'image' | 'document'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const selected = this.selected;
    if (!file) return;
    if (selected?.kind === 'support') {
      this.sendSupportMedia(selected.id, file, type);
    } else if (!this.orderOnlyMode) {
      this.pendingInitialMedia = { file, type };
    }
  }

  toggleOrderRecording(): void {
    if (this.recording()) {
      this.mediaRecorder?.stop();
      return;
    }
    this.pendingVoiceFile = undefined;
    void this.beginOrderRecording();
  }

  private async beginOrderRecording(): Promise<void> {
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
        const selected = this.selected;
        if (this.recordedChunks.length > 0 && (selected?.kind === 'order' || selected?.kind === 'support' || !this.orderOnlyMode)) {
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
    const selected = this.selected;
    if (!this.pendingVoiceFile || selected?.kind !== 'order' || this.sending) return;
    const file = this.pendingVoiceFile;
    this.pendingVoiceFile = undefined;
    this.sendOrderMedia(selected.orderId, file, 'audio');
  }

  private sendSupportMedia(conversationId: string, file: File, type: 'image' | 'audio' | 'document'): void {
    if (this.sending) return;
    this.sending = true;
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.sending = false;
        return;
      }
      this.support.sendCustomerMedia(conversationId, file, type, token).pipe(finalize(() => this.sending = false)).subscribe({
        next: (conversation) => {
          this.support.upsertConversation(conversation);
          this.pendingVoiceFile = undefined;
        },
        error: (err) => this.toast.show(err?.error?.message || 'Could not send file.', 'error')
      });
    });
  }

  private sendOrderMedia(orderId: string | undefined, file: File, type: 'image' | 'audio' | 'document'): void {
    if (!orderId || this.sending) return;
    this.sending = true;
    this.auth.ensureAccessToken().subscribe((token) => {
      if (!token) {
        this.sending = false;
        return;
      }
      this.ordersApi.sendOrderMedia(orderId, file, type, token).pipe(finalize(() => this.sending = false)).subscribe({
        next: (message) => {
          this.orderConversations = this.orderConversations.map((conversation) =>
            conversation.kind === 'order' && conversation.orderId === orderId
              ? {
                  ...conversation,
                  updatedAt: message.createdAt,
                  messages: conversation.messages.some((item) => item.id === message.id)
                    ? conversation.messages
                    : [...conversation.messages, this.toSupportMessage(message)]
                }
              : conversation);
          this.conversations = this.combineConversations(this.support.conversations(), this.orderConversations);
        },
        error: () => this.toast.show('Could not send file.', 'error')
      });
    });
  }

  private toMessageConversation(conversation: OrderConversation): MessageConversation {
    return {
      id: conversation.id,
      userId: '',
      userName: '',
      userEmail: '',
      subject: conversation.subject,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      kind: 'order',
      orderId: conversation.orderId,
      messages: conversation.messages.map((message) => this.toSupportMessage(message))
    };
  }

  private toSupportMessage(message: OrderConversation['messages'][number]): SupportMessage {
    return {
      id: message.id,
      conversationId: message.orderId,
      senderRole: message.senderRole,
      senderName: message.senderName,
      senderEmail: message.senderEmail,
      body: message.message,
      createdAt: message.createdAt,
      messageType: message.messageType,
      mediaUrl: message.mediaUrl,
      fileName: message.fileName
    };
  }

  mediaUrl(url?: string | null): string {
    return url?.startsWith('http') ? url : `${this.apiBaseUrl}${url || ''}`;
  }

  private combineConversations(support: SupportConversation[], orders: MessageConversation[]): MessageConversation[] {
    return [
      ...(this.orderOnlyMode ? [] : support.map((conversation) => ({ ...conversation, kind: 'support' as const }))),
      ...(this.orderOnlyMode ? orders : [])
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
