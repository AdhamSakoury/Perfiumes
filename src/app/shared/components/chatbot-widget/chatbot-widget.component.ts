import { CurrencyPipe } from '@angular/common';
import { Component, effect, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Perfume } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { ChatbotService } from '@core/services/chatbot.service';
import { StorageService } from '@core/services/storage.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { SupportMessageService } from '@core/services/support-message.service';

interface ChatMessage {
  role: 'bot' | 'user';
  text: string;
  suggestedProducts?: Perfume[];
}

const CHAT_HISTORY_PREFIX = 'gnouby_chat_history_v2';

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.css'
})
export class ChatbotWidgetComponent {
  @ViewChild('messagesPanel') private readonly messagesPanel?: ElementRef<HTMLDivElement>;

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly creatingSupport = signal(false);
  message = '';
  messages: ChatMessage[] = [this.welcomeMessage()];
  private activeHistoryKey = this.historyKey();

  constructor(
    private readonly auth: AuthService,
    private readonly chatbot: ChatbotService,
    private readonly storage: StorageService,
    private readonly i18n: LocalizationService,
    private readonly support: SupportMessageService
  ) {
    this.messages = this.readHistory();

    effect(() => {
      const nextKey = this.historyKey();
      if (nextKey === this.activeHistoryKey) return;

      this.activeHistoryKey = nextKey;
      this.message = '';
      this.sending.set(false);
      this.messages = this.readHistory();
      this.scrollSoon();
    });
  }

  toggle(): void {
    this.open.set(!this.open());
    this.scrollSoon();
  }

  send(): void {
    const message = this.message.trim();
    if (!message || this.sending()) return;

    this.messages = [...this.messages, { role: 'user', text: message }];
    this.saveHistory();
    this.message = '';
    this.sending.set(true);
    this.scrollSoon();

const history = this.messages
      .filter((m) => m.text && m.text !== this.welcomeMessage().text)
      .slice(-6)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text
      }));

    this.chatbot.sendMessage(message, null, history).subscribe({
      next: (response) => {
        this.messages = [
          ...this.messages,
          {
            role: 'bot',
            text: response.reply,
            suggestedProducts: response.suggestedProducts
          }
        ];
        this.saveHistory();
        this.sending.set(false);
        this.scrollSoon();
      },
      error: () => {
        this.messages = [
          ...this.messages,
          {
            role: 'bot',
            text: this.i18n.t('chatbotBackendError')
          }
        ];
        this.saveHistory();
        this.sending.set(false);
        this.scrollSoon();
      }
    });
  }

  newChat(): void {
    this.message = '';
    this.sending.set(false);
    this.messages = [this.welcomeMessage()];
    this.saveHistory();
    this.scrollSoon();
  }

  contactAdmin(): void {
    const user = this.auth.currentUser();
    if (!user) {
      this.messages = [
        ...this.messages,
        {
          role: 'bot',
          text: 'Please login first so the admin can reply to your account.'
        }
      ];
      this.saveHistory();
      this.scrollSoon();
      return;
    }

    const lastUserMessage = [...this.messages].reverse().find((item) => item.role === 'user')?.text;
    const body = lastUserMessage || this.message.trim() || 'I need help from an admin about the chatbot answer.';
    if (this.creatingSupport()) return;

    this.creatingSupport.set(true);
    this.support.createConversation(user, body).subscribe({
      next: () => {
        this.creatingSupport.set(false);
        this.messages = [
          ...this.messages,
          {
            role: 'bot',
            text: 'I sent this to the admin team. You can continue here, and an admin can reply from the dashboard.'
          }
        ];
        this.saveHistory();
        this.scrollSoon();
      },
      error: () => {
        this.creatingSupport.set(false);
        this.messages = [
          ...this.messages,
          {
            role: 'bot',
            text: 'I could not send this to the admin right now. Please try again in a moment.'
          }
        ];
        this.saveHistory();
        this.scrollSoon();
      }
    });
  }

  formatMessage(text: string): string {
    if (!text) return '';
    // Escape HTML tags to prevent XSS
    let safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Replace bold **text** with styled <strong>
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-nubian-gold dark:text-nubian-gold">$1</strong>');
    
    // Replace bullet points starting with * or - or •
    safe = safe.replace(/^[\*\-\•]\s*(.+)$/gm, '<li class="my-0.5 leading-relaxed">$1</li>');
    safe = safe.replace(/(<li[\s\S]*?<\/li>)/g, '<ul class="list-disc pr-4 space-y-1 my-1.5">$1</ul>');
    // Consolidate adjacent </ul><ul class="..."> tags
    safe = safe.replace(/<\/ul>\s*<ul class="list-disc pr-4 space-y-1 my-1.5">/g, '');

    // Convert newlines to breaks
    safe = safe.replace(/\n\n+/g, '<div class="h-2"></div>');
    safe = safe.replace(/\n/g, '<br/>');

    return safe;
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = 'https://via.placeholder.com/80x80/1B4D4D/FFFFFF?text=G';
  }

  private historyKey(): string {
    const user = this.auth.currentUser();
    return `${CHAT_HISTORY_PREFIX}_${user?.id || 'guest'}`;
  }

  private readHistory(): ChatMessage[] {
    const stored = this.storage.get<ChatMessage[]>(this.activeHistoryKey, []);
    return stored.length ? stored : [this.welcomeMessage()];
  }

  private saveHistory(): void {
    this.storage.set(this.activeHistoryKey, this.messages);
  }

  private scrollSoon(): void {
    setTimeout(() => this.scrollToBottom(), 0);
  }

  private scrollToBottom(): void {
    const panel = this.messagesPanel?.nativeElement;
    if (!panel) return;
    panel.scrollTop = panel.scrollHeight;
  }

  private welcomeMessage(): ChatMessage {
    return {
      role: 'bot',
      text: this.i18n.t('chatbotWelcome')
    };
  }
}
