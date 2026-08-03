import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-resend-confirmation',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './resend-confirmation.component.html',
  styleUrl: './resend-confirmation.component.css'
})
export class ResendConfirmationComponent {
  email = '';

  constructor(private readonly toast: ToastService) {}

  resend(): void {
    this.toast.show(`Confirmation email prepared for ${this.email}.`);
  }
}

