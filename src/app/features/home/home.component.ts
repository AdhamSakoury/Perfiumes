import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PerfumeCardComponent } from '@shared/components/perfume-card/perfume-card.component';
import { PerfumeService } from '@core/services/perfume.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [FormsModule, PerfumeCardComponent, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomePageComponent {
  newsletterEmail = '';

  constructor(readonly perfumeService: PerfumeService, private readonly toast: ToastService) {}

  subscribe(): void {
    this.toast.show(`Thank you for subscribing with: ${this.newsletterEmail}`);
    this.newsletterEmail = '';
  }
}

