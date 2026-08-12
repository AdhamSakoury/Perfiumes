import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-onboarding-tenant',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './onboarding-tenant.component.html',
  styleUrl: './onboarding-tenant.component.css'
})
export class OnboardingTenantComponent {}

