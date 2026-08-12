import { DatePipe } from '@angular/common';
import { Component, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupportConversation, SupportMessage } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { SupportMessageService } from '@core/services/support-message.service';
import { ToastService } from '@core/services/toast.service';
import { finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './admin-messages.component.html',
  styleUrl: './admin-messages.component.css'
})
export class AdminMessagesComponent {
  conversations: SupportConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  loading = false;
  replying = false;
  tokenLoading = false;

  constructor(
    readonly auth: AuthService,
    private readonly support: SupportMessageService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {
    this.applyConversations(this.seedConversations());

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
    this.refreshConversations(false);
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get selected(): SupportConversation | null {
    return this.conversations.find((item) => item.id === this.selectedId) || this.conversations[0] || null;
  }

  load(): void {
    this.refreshConversations(true);
  }

  private refreshConversations(showBusy: boolean): void {
    if (!this.isAdmin) return;
    this.loading = showBusy && this.conversations.length === 0;
    this.withAdminToken((token) => {
      this.support.getAdminConversations(token).pipe(
        timeout(8000),
        finalize(() => {
          this.loading = false;
        })
      ).subscribe({
        next: (items) => {
          this.applyConversations(items.length ? items : this.seedConversations());
        },
        error: () => {
          this.applyConversations(this.seedConversations());
          this.toast.show('Could not load support messages.', 'error');
        }
      });
    });
  }

  select(conversation: SupportConversation): void {
    this.selectedId = conversation.id;
    this.replyText = '';
  }

  reply(): void {
    const selected = this.selected;
    const user = this.auth.currentUser();
    const body = this.replyText.trim();
    if (!selected || !user || !body || this.replying) return;

    this.support.upsertConversation(this.withTempMessage(selected, 'Gnouby Admin', user.email, 'admin', body, 'answered'));
    this.replyText = '';
    this.replying = true;
    this.withAdminToken((token) => {
      this.support.replyAsAdmin(selected.id, body, token).subscribe({
        next: (updated) => {
          this.replaceConversation(updated);
          this.replying = false;
        },
        error: () => {
          this.support.upsertConversation(selected);
          this.replyText = body;
          this.replying = false;
          this.toast.show('Reply failed.', 'error');
        }
      });
    });
  }

  closeSelected(): void {
    const selected = this.selected;
    if (!selected) return;

    this.withAdminToken((token) => {
      this.support.closeConversation(selected.id, token).subscribe({
        next: (updated) => this.replaceConversation(updated),
        error: () => this.toast.show('Could not close conversation.', 'error')
      });
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

  private seedConversations(): SupportConversation[] {
    const now = new Date();
    return [
      this.seedConversation(
        'support_demo_1',
        'test_customer_1',
        'Mariam Hassan',
        'mariam@test.local',
        'Need help with order',
        'open',
        'My order tracking did not update yet.',
        now,
        8
      ),
      this.seedConversation(
        'support_demo_2',
        'test_customer_2',
        'Laila Fathy',
        'laila@test.local',
        'Wallet question',
        'open',
        'Can I use my wallet balance at checkout?',
        now,
        9
      ),
      this.seedConversation(
        'support_demo_3',
        'test_customer_3',
        'Adham',
        'adham@test.local',
        'Need help',
        'answered',
        'Need help',
        now,
        10
      ),
      this.seedConversation(
        'support_demo_4',
        'test_customer_11',
        'Hana Mahmoud',
        'hana@test.local',
        'Perfume recommendation',
        'answered',
        'I need a perfume recommendation for evening use.',
        now,
        11
      )
    ];
  }

  private seedConversation(
    id: string,
    userId: string,
    userName: string,
    userEmail: string,
    subject: string,
    status: string,
    body: string,
    now: Date,
    hoursAgo: number
  ): SupportConversation {
    const createdAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
    return {
      id,
      userId,
      userName,
      userEmail,
      subject,
      status,
      createdAt,
      updatedAt: createdAt,
      messages: [
        {
          id: `${id}_msg_1`,
          conversationId: id,
          senderRole: 'customer',
          senderName: userName,
          senderEmail: userEmail,
          body,
          createdAt
        }
      ]
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

  private withAdminToken(callback: (token: string) => void): void {
    const currentToken = this.auth.currentAccessToken();
    if (currentToken) {
      callback(currentToken);
      return;
    }

    const user = this.auth.currentUser();
    if (!user?.password) {
      this.loading = false;
      this.replying = false;
      this.toast.show('Your admin session is old. Please logout and login again.', 'error');
      return;
    }

    this.tokenLoading = true;
    this.auth.loginAdminApi(user.email, user.password).subscribe({
      next: (token) => {
        this.tokenLoading = false;
        callback(token);
      },
      error: () => {
        this.tokenLoading = false;
        this.loading = false;
        this.replying = false;
        this.toast.show('Please login again as admin.', 'error');
      }
    });
  }
}
