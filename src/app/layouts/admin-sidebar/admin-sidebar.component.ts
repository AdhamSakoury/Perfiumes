import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.css'
})
export class AdminSidebarComponent {
  readonly open = signal(false);
  readonly financeOpen = signal(true);

  constructor(readonly auth: AuthService) {}

  toggleFinance(): void {
    this.financeOpen.set(!this.financeOpen());
  }

  close(): void {
    this.open.set(false);
  }
}
