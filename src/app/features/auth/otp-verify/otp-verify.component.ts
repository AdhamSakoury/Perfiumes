import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-otp-verify',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './otp-verify.component.html',
  styleUrl: './otp-verify.component.css'
})
export class OtpVerifyComponent {
  code = '';

  constructor(private readonly toast: ToastService) {}

  verify(): void {
    this.toast.show(this.code.length >= 4 ? 'OTP verified locally.' : 'Enter a valid OTP code.', this.code.length >= 4 ? 'success' : 'error');
  }
}

