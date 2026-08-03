import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { GoogleSignInButtonComponent } from '../google-sign-in-button/google-sign-in-button.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, GoogleSignInButtonComponent, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginPageComponent {
  email = '';
  password = '';
  remember = true;
  showPassword = false;
  errors: { email?: string; password?: string } = {};

  constructor(private readonly auth: AuthService, private readonly route: ActivatedRoute, private readonly router: Router) {
    if (this.auth.currentUser()) {
      void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') || '/account');
    }
  }

  submit(): void {
    this.errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) this.errors.email = 'Please enter a valid email address';
    if (this.password.length < 6) this.errors.password = 'Password must be at least 6 characters';
    if (Object.keys(this.errors).length) return;

    const result = this.auth.login(this.email, this.password, this.remember);
    if (!result.success) {
      this.errors.email = result.message;
      return;
    }

    void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') || '/account');
  }
}

