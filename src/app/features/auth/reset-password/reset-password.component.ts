import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css'
})
export class ResetPasswordComponent {
  password = '';
  confirmPassword = '';
  error = '';

  constructor(private readonly toast: ToastService, private readonly i18n: LocalizationService) {}

  submit(): void {
    this.error = '';
    if (this.password.length < 8 || this.password !== this.confirmPassword) {
      this.error = this.i18n.t('resetPasswordValidation');
      return;
    }
    this.toast.show(this.i18n.t('resetPasswordReady'));
    this.password = '';
    this.confirmPassword = '';
  }
}

