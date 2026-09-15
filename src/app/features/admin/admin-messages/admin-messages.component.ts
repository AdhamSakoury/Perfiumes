import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
export class AdminMessagesComponent {
  readonly apiBaseUrl = environment.apiBaseUrl;
  conversations: SupportConversation[] = [];
  selectedId: string | null = null;
  replyText = '';
  loading = false;
  replying = false;
  tokenLoading = false;
  loadError = '';

  constructor(
    readonly auth: AuthService,
    private readonly support: SupportMessageService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
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

  load(): void {
    this.refreshConversations(true);
  }

  private refreshConversations(showBusy: boolean): void {
    if (!this.isAdmin) return;
    this.loading = showBusy && this.conversations.length === 0;
    this.loadError = '';
    this.adminRequest((token) => this.support.getAdminConversations(token)).pipe(
      timeout(8000),
      finalize(() => {
        this.loading = false;
      })
    ).subscribe({
      next: (items) => {
        this.applyConversations(items);
      },
      error: () => {
        this.loadError = this.i18n.t('supportMessagesLoadFailed');
        this.toast.show(this.i18n.t('supportMessagesLoadFailed'), 'error');
      }
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
    this.adminRequest((token) => this.support.replyAsAdmin(selected.id, body, token)).subscribe({
      next: (updated) => {
        this.replaceConversation(updated);
        this.replying = false;
      },
      error: () => {
        this.support.upsertConversation(selected);
        this.replyText = body;
        this.replying = false;
        this.toast.show(this.i18n.t('replyFailed'), 'error');
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
