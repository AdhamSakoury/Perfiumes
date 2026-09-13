import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { OrderMessage } from '@core/models/store.models';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DeliveryLocationEvent {
  orderId: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface OrderStatusEvent {
  orderId: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class OrderTrackingService {
  private hubConnection: HubConnection | null = null;
  private readonly locationSubject = new Subject<DeliveryLocationEvent>();
  private readonly messageSubject = new Subject<OrderMessage>();
  private readonly statusSubject = new Subject<OrderStatusEvent>();

  readonly location$ = this.locationSubject.asObservable();
  readonly message$ = this.messageSubject.asObservable();
  readonly status$ = this.statusSubject.asObservable();

  private activeOrders = new Set<string>();

  startConnection(orderId?: string): Promise<void> {
    if (orderId) {
      this.activeOrders.add(orderId);
    }

    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      if (orderId) {
        return this.hubConnection.invoke('JoinOrderGroup', orderId).catch(() => {});
      }
      return Promise.resolve();
    }

    const hubUrl = `${environment.apiBaseUrl}/orderTrackingHub` + (orderId ? `?orderId=${encodeURIComponent(orderId)}` : '');
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .configureLogging(LogLevel.None)
      .build();

    this.hubConnection.on('deliveryLocationUpdated', (data: any) => {
      this.locationSubject.next({
        orderId: data.orderId || data.OrderId,
        latitude: data.latitude ?? data.Latitude,
        longitude: data.longitude ?? data.Longitude,
        updatedAt: data.updatedAt || data.UpdatedAt || new Date().toISOString()
      });
    });

    this.hubConnection.on('orderMessageReceived', (msg: OrderMessage) => {
      this.messageSubject.next(msg);
    });

    this.hubConnection.on('orderStatusChanged', (data: any) => {
      this.statusSubject.next({
        orderId: data.orderId || data.OrderId,
        status: data.status || data.Status
      });
    });

    this.hubConnection.onreconnected(() => {
      for (const id of this.activeOrders) {
        this.hubConnection?.invoke('JoinOrderGroup', id).catch(() => {});
      }
    });

    return this.hubConnection.start().catch((err) => {
      console.warn('OrderTrackingHub connection warning:', err);
    });
  }

  joinOrder(orderId: string): void {
    this.activeOrders.add(orderId);
    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      this.hubConnection.invoke('JoinOrderGroup', orderId).catch(() => {});
    } else {
      void this.startConnection(orderId);
    }
  }

  leaveOrder(orderId: string): void {
    this.activeOrders.delete(orderId);
    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      this.hubConnection.invoke('LeaveOrderGroup', orderId).catch(() => {});
    }
  }

  stopConnection(): void {
    if (this.hubConnection) {
      void this.hubConnection.stop();
      this.hubConnection = null;
    }
    this.activeOrders.clear();
  }
}
