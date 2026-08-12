import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterPageComponent {
  fullName = '';
  email = '';
  password = '';
  confirmPassword = '';
  terms = false;
  showPassword = false;
  strength = 0;
  loading = false;
  errors: Record<string, string | undefined> = {};

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly i18n: LocalizationService) {
    if (this.auth.currentUser()) void this.router.navigateByUrl('/account');
  }

  updateStrength(): void {
    this.strength = 0;
    if (this.password.length >= 8) this.strength++;
    if (/[a-z]/.test(this.password) && /[A-Z]/.test(this.password)) this.strength++;
    if (/[0-9]/.test(this.password)) this.strength++;
    if (/[^a-zA-Z0-9]/.test(this.password)) this.strength++;
  }

  submit(): void {
    this.errors = {};
    if (this.fullName.trim().length < 2) this.errors['fullName'] = this.i18n.t('fullNameRequired');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) this.errors['email'] = this.i18n.t('validEmailError');
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(this.password)) {
      this.errors['password'] = this.i18n.t('passwordComplexityError');
    }
    if (this.password !== this.confirmPassword) this.errors['confirmPassword'] = this.i18n.t('passwordsMismatch');
    if (!this.terms) this.errors['terms'] = this.i18n.t('termsRequired');
    if (Object.values(this.errors).some(Boolean)) return;

    this.loading = true;
    this.auth.register(this.fullName.trim(), this.email.trim(), this.password).subscribe({
      next: (result) => {
        this.loading = false;
        if (!result.success) {
          this.errors['email'] = result.message;
          return;
        }

        void this.router.navigateByUrl('/account');
      },
      error: (error) => {
        this.loading = false;
        this.errors['email'] = error?.error?.message || 'Registration failed';
      }
    });
  }
}

