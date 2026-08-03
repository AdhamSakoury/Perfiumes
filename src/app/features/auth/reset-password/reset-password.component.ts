import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css'
})
export class ResetPasswordComponent {
  password = '';
  confirmPassword = '';
  error = '';

  constructor(private readonly toast: ToastService) {}

  submit(): void {
    this.error = '';
    if (this.password.length < 8 || this.password !== this.confirmPassword) {
      this.error = 'Password must be at least 8 characters and both fields must match.';
      return;
    }
    this.toast.show('Password reset flow is ready for backend confirmation.');
    this.password = '';
    this.confirmPassword = '';
  }
}

