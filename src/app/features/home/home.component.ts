import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { PerfumeService } from '@core/services/perfume.service';
import { ToastService } from '@core/services/toast.service';
import { LocalizationService } from '@core/services/localization.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [FormsModule, PerfumeCardComponent, RouterLink, TranslatePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomePageComponent {
  newsletterEmail = '';

  constructor(readonly perfumeService: PerfumeService, private readonly toast: ToastService, private readonly i18n: LocalizationService) {}

  subscribe(): void {
    this.toast.show(this.i18n.t('newsletterThanks').replace('{email}', this.newsletterEmail));
    this.newsletterEmail = '';
  }
}

