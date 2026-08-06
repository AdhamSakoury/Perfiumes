import { Injectable, signal } from '@angular/core';

const DARK_MODE_KEY = 'gnouby_dark_mode';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDark = signal(false);

  init(): void {
    const saved = localStorage.getItem(DARK_MODE_KEY) === 'true';
    this.apply(saved);
  }

  toggle(): void {
    this.apply(!this.isDark());
  }

  setDark(isDark: boolean): void {
    this.apply(isDark);
  }

  private apply(isDark: boolean): void {
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem(DARK_MODE_KEY, String(isDark));
    this.isDark.set(isDark);
  }
}

