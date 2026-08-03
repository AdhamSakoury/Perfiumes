import { Component } from '@angular/core';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-google-sign-in-button',
  standalone: true,
  templateUrl: './google-sign-in-button.component.html',
  styleUrl: './google-sign-in-button.component.css'
})
export class GoogleSignInButtonComponent {
  constructor(private readonly toast: ToastService) {}

  startGoogleSignIn(): void {
    this.toast.show('Google sign-in component is ready for backend OAuth integration.');
  }
}

