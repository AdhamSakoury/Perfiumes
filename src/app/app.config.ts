import { ApplicationConfig, DEFAULT_CURRENCY_CODE } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    provideHttpClient(),
    provideAnimations(),
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'EGP' }
  ]
};

