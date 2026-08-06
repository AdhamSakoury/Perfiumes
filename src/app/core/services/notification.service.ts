import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'order' | 'promo' | 'system';
  isRead: boolean;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly notifications = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly connected = signal(false);

  private hubConnection?: signalR.HubConnection;
  private connectedUserEmail?: string;

  constructor(private readonly http: HttpClient, private readonly auth: AuthService) {}

  unreadCount(): number {
    return this.notifications().filter((item) => !item.isRead).length;
  }

  connectForCurrentUser(): void {
    const user = this.auth.currentUser();

    if (!user) {
      this.disconnect();
      return;
    }

    if (this.hubConnection && this.connectedUserEmail === user.email) {
      return;
    }

    this.disconnect();
    this.connectedUserEmail = user.email;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiBaseUrl}/notificationHub?userEmail=${encodeURIComponent(user.email)}`)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('notificationCreated', (notification: AppNotification) => {
      this.notifications.update((items) => [notification, ...items.filter((item) => item.id !== notification.id)]);
    });

    this.hubConnection.on('notificationsUpdated', (items: AppNotification[]) => {
      this.notifications.set(items);
    });

    this.hubConnection.onreconnected(() => {
      this.connected.set(true);
      this.load();
    });

    this.hubConnection.onclose(() => {
      this.connected.set(false);
    });

    this.hubConnection
      .start()
      .then(() => {
        this.connected.set(true);
        this.load();
      })
      .catch(() => {
        this.connected.set(false);
      });
  }

  disconnect(): void {
    const connection = this.hubConnection;
    this.hubConnection = undefined;
    this.connectedUserEmail = undefined;
    this.connected.set(false);

    if (connection) {
      connection.stop().catch(() => undefined);
    }
  }

  load(): void {
    const user = this.auth.currentUser();
    if (!user) {
      this.notifications.set([]);
      return;
    }

    this.loading.set(true);
    this.http
      .get<AppNotification[]>(`${environment.apiBaseUrl}/api/notifications`, {
        params: { userEmail: user.email }
      })
      .subscribe({
        next: (items) => {
          this.notifications.set(items);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        }
      });
  }

  markAsRead(id: string): void {
    const user = this.auth.currentUser();
    if (!user) return;

    this.http
      .post<AppNotification[]>(`${environment.apiBaseUrl}/api/notifications/${id}/read`, null, {
        params: { userEmail: user.email }
      })
      .subscribe((items) => this.notifications.set(items));
  }

  markAllAsRead(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    this.http
      .post<AppNotification[]>(`${environment.apiBaseUrl}/api/notifications/read-all`, null, {
        params: { userEmail: user.email }
      })
      .subscribe((items) => this.notifications.set(items));
  }

  sendTestNotification(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    this.http
      .post<AppNotification>(`${environment.apiBaseUrl}/api/notifications`, {
        userEmail: user.email,
        title: 'Live notification',
        message: 'SignalR is connected and this notification arrived in real time.',
        type: 'info'
      })
      .subscribe();
  }
}
