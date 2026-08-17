import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NewsletterSubscriber {
  id: string;
  email: string;
  createdAt: string;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class NewsletterService {
  constructor(private readonly http: HttpClient) {}

  subscribe(email: string): Observable<NewsletterSubscriber> {
    return this.http.post<NewsletterSubscriber>(`${environment.apiBaseUrl}/api/newsletter/subscribe`, { email });
  }

  getSubscribers(token: string): Observable<NewsletterSubscriber[]> {
    return this.http.get<NewsletterSubscriber[]>(`${environment.apiBaseUrl}/api/admin/newsletter/subscribers`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }
}
