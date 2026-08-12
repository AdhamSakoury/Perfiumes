import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-onboarding-owner',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './onboarding-owner.component.html',
  styleUrl: './onboarding-owner.component.css'
})
export class OnboardingOwnerComponent {}

