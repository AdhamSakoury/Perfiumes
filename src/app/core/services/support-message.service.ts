import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { SupportConversation, User } from '@core/models/store.models';
import * as signalR from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SupportMessageService {
  readonly conversations = signal<SupportConversation[]>([]);
  readonly connected = signal(false);

  private hubConnection?: signalR.HubConnection;
  private connectedUserKey?: string;

  constructor(private readonly http: HttpClient, private readonly auth: AuthService) {}

  connectForCurrentUser(): void {
    const user = this.auth.currentUser();
    if (!user) {
      this.disconnect();
      return;
    }

    const key = `${user.email}:${user.role || 'customer'}`;
    if (this.hubConnection && this.connectedUserKey === key) return;

    this.disconnect();
    this.connectedUserKey = key;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiBaseUrl}/supportHub?userEmail=${encodeURIComponent(user.email)}&role=${encodeURIComponent(user.role || 'customer')}`)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('supportConversationCreated', (conversation: SupportConversation) => {
      this.upsertConversation(conversation);
    });

    this.hubConnection.on('supportConversationUpdated', (conversation: SupportConversation) => {
      this.upsertConversation(conversation);
    });

    this.hubConnection.onreconnected(() => {
      this.connected.set(true);
    });

    this.hubConnection.onclose(() => {
      this.connected.set(false);
    });

    this.hubConnection
      .start()
      .then(() => this.connected.set(true))
      .catch(() => this.connected.set(false));
  }

  disconnect(): void {
    const connection = this.hubConnection;
    this.hubConnection = undefined;
    this.connectedUserKey = undefined;
    this.connected.set(false);

    if (connection) {
      connection.stop().catch(() => undefined);
    }
  }

  createConversation(user: User, message: string, subject = 'Chatbot help request'): Observable<SupportConversation> {
    return this.http.post<SupportConversation>(`${environment.apiBaseUrl}/api/support/conversations`, {
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      message,
      subject
    }).pipe(tap((conversation) => this.upsertConversation(conversation)));
  }

  getMyConversations(userEmail: string): Observable<SupportConversation[]> {
    return this.http.get<SupportConversation[]>(`${environment.apiBaseUrl}/api/support/conversations`, {
      params: { userEmail }
    }).pipe(tap((items) => this.conversations.set(items)));
  }

  addCustomerMessage(conversationId: string, user: User, body: string): Observable<SupportConversation> {
    return this.http.post<SupportConversation>(`${environment.apiBaseUrl}/api/support/conversations/${conversationId}/messages`, {
      senderName: user.fullName,
      senderEmail: user.email,
      body
    }).pipe(tap((conversation) => this.upsertConversation(conversation)));
  }

  getAdminConversations(token: string): Observable<SupportConversation[]> {
    return this.http.get<SupportConversation[]>(`${environment.apiBaseUrl}/api/admin/support/conversations`, {
      headers: this.authHeaders(token)
    }).pipe(tap((items) => this.conversations.set(items)));
  }

  replyAsAdmin(conversationId: string, body: string, token: string): Observable<SupportConversation> {
    return this.http.post<SupportConversation>(
      `${environment.apiBaseUrl}/api/admin/support/conversations/${conversationId}/reply`,
      { body },
      { headers: this.authHeaders(token) }
    ).pipe(tap((conversation) => this.upsertConversation(conversation)));
  }

  closeConversation(conversationId: string, token: string): Observable<SupportConversation> {
    return this.http.post<SupportConversation>(
      `${environment.apiBaseUrl}/api/admin/support/conversations/${conversationId}/close`,
      null,
      { headers: this.authHeaders(token) }
    ).pipe(tap((conversation) => this.upsertConversation(conversation)));
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  upsertConversation(conversation: SupportConversation): void {
    this.conversations.update((items) =>
      [conversation, ...items.filter((item) => item.id !== conversation.id)]
        .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.updatedAt.localeCompare(a.updatedAt))
    );
  }

  removeConversation(id: string): void {
    this.conversations.update((items) => items.filter((item) => item.id !== id));
  }
}
