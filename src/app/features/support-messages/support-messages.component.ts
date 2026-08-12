import { DatePipe } from '@angular/common';
import { Component, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupportConversation, SupportMessage, User } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { SupportMessageService } from '@core/services/support-message.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-support-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './support-messages.component.html',
  styleUrl: './support-messages.component.css'
})
export class SupportMessagesComponent {
  conversations: SupportConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  newMessage = '';
  composing = false;
  loading = false;
  sending = false;
  creating = false;

  constructor(
    readonly auth: AuthService,
    readonly support: SupportMessageService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    effect(() => {
      this.conversations = this.support.conversations();
      if (!this.selectedId && this.conversations.length && !this.composing) this.selectedId = this.conversations[0].id;
    });

    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/messages' } });
      return;
    }

    this.support.connectForCurrentUser();
    this.load();
  }

  get selected(): SupportConversation | null {
    if (this.composing) return null;
    return this.conversations.find((item) => item.id === this.selectedId) || null;
  }

  load(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    this.loading = true;
    this.support.getMyConversations(user.email).subscribe({
      next: (items) => {
        this.conversations = items;
        if (!this.selectedId && items.length) this.selectedId = items[0].id;
        if (!items.length) this.composing = true;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.show('Could not load messages.', 'error');
      }
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
  }

  createConversation(): void {
    const user = this.auth.currentUser();
    const body = this.newMessage.trim();
    const subject = this.buildSubject(body);
    if (!user || !body || this.creating) return;

    const tempConversation = this.tempConversation(user, body, subject);
    this.support.upsertConversation(tempConversation);
    this.selectedId = tempConversation.id;
    this.newMessage = '';
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
    const body = this.replyText.trim();
    if (!user || !selected || !body || this.sending || selected.status === 'closed') return;

    this.support.upsertConversation(this.withTempMessage(selected, user.fullName, user.email, 'customer', body, 'open'));
    this.replyText = '';
    this.sending = true;
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
