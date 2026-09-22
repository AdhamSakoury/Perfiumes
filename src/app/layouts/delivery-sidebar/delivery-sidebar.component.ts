import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-delivery-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './delivery-sidebar.component.html',
  styleUrl: './delivery-sidebar.component.css'
})
export class DeliverySidebarComponent {
  readonly open = signal(false);

  constructor(readonly auth: AuthService) {}

  close(): void {
    this.open.set(false);
  }
}
