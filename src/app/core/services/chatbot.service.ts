import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ChatbotMessageResponse } from '@core/models/store.models';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatHistoryPayload {
  role: string;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  constructor(private readonly http: HttpClient) {}

  sendMessage(message: string, productId: number | null = null, history: ChatHistoryPayload[] = []): Observable<ChatbotMessageResponse> {
    return this.http.post<ChatbotMessageResponse>(`${environment.apiBaseUrl}/api/chatbot/message`, {
      message,
      productId,
      history
    });
  }
}
