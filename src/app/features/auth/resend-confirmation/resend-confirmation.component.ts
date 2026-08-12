import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-resend-confirmation',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './resend-confirmation.component.html',
  styleUrl: './resend-confirmation.component.css'
})
export class ResendConfirmationComponent {
  email = '';

  constructor(private readonly toast: ToastService, private readonly i18n: LocalizationService) {}

  resend(): void {
    this.toast.show(this.i18n.t('confirmationPrepared').replace('{email}', this.email));
  }
}

