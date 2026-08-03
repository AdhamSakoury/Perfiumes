import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-onboarding-tenant',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './onboarding-tenant.component.html',
  styleUrl: './onboarding-tenant.component.css'
})
export class OnboardingTenantComponent {}

