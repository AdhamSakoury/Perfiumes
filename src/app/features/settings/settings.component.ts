import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { AppLanguage, LocalizationService } from '@core/services/localization.service';
import { StorageService } from '@core/services/storage.service';
import { ThemeService } from '@core/services/theme.service';
import { ToastService } from '@core/services/toast.service';
import { CustomDropdownComponent, CustomDropdownOption } from '@shared/components/custom-dropdown/custom-dropdown.component';
import { translateAddress } from '@core/utils/address-translator.util';

interface UserSettings {
  emailNotifications: boolean;
  orderNotifications: boolean;
  promoNotifications: boolean;
  language: 'en' | 'ar';
  profileVisibility: 'private' | 'members';
  saveChatHistory: boolean;
  chatbotTone: 'friendly' | 'direct' | 'luxury';
}

type SettingsSection = 'profile' | 'security' | 'preferences' | 'chatbot' | 'admin' | 'danger';

const DEFAULT_SETTINGS: UserSettings = {
  emailNotifications: true,
  orderNotifications: true,
  promoNotifications: false,
  language: 'en',
  profileVisibility: 'private',
  saveChatHistory: true,
  chatbotTone: 'friendly'
};

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, RouterLink, CustomDropdownComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsPageComponent {
  readonly activeSection = signal<SettingsSection>('profile');

  profileForm = {
    fullName: '',
    email: '',
    phone: '',
    address: ''
  };
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  settings: UserSettings = { ...DEFAULT_SETTINGS };
  deleteConfirm = '';

  constructor(
    readonly auth: AuthService,
    readonly i18n: LocalizationService,
    readonly theme: ThemeService,
    private readonly router: Router,
    private readonly storage: StorageService,
    private readonly toast: ToastService
  ) {
    const user = this.auth.currentUser();
    if (!user) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/settings' } });
      return;
    }

    this.profileForm = {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      address: translateAddress(user.address || '', this.i18n.language())
    };
    this.settings = {
      ...this.storage.get<UserSettings>(this.settingsKey(), DEFAULT_SETTINGS),
      language: this.i18n.language()
    };
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  get languageOptions(): CustomDropdownOption[] {
    return [
      { value: 'en', label: this.i18n.t('english'), icon: 'fa-language' },
      { value: 'ar', label: this.i18n.t('arabic'), icon: 'fa-language' }
    ];
  }

  get privacyOptions(): CustomDropdownOption[] {
    return [
      { value: 'private', label: this.i18n.t('private'), icon: 'fa-lock' },
      { value: 'members', label: this.i18n.t('membersOnly'), icon: 'fa-users' }
    ];
  }

  get toneOptions(): CustomDropdownOption[] {
    return [
      { value: 'friendly', label: this.i18n.t('friendly'), icon: 'fa-face-smile' },
      { value: 'direct', label: this.i18n.t('direct'), icon: 'fa-bolt' },
      { value: 'luxury', label: this.i18n.t('luxuryAdvisor'), icon: 'fa-gem' }
    ];
  }

  selectSection(section: SettingsSection): void {
    if (section === 'admin' && !this.isAdmin) {
      this.activeSection.set('profile');
      return;
    }

    this.activeSection.set(section);
  }

  saveProfile(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    if (!this.profileForm.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.profileForm.email)) {
      this.toast.show(this.i18n.t('nameEmailRequired'), 'error');
      return;
    }

    this.auth.updateCurrentUser({
      ...user,
      fullName: this.profileForm.fullName.trim(),
      name: this.profileForm.fullName.trim(),
      email: this.profileForm.email.trim().toLowerCase(),
      phone: this.profileForm.phone.trim(),
      address: this.profileForm.address.trim()
    });
    this.toast.show(this.i18n.t('profileSettingsSaved'));
  }

  changePassword(): void {
    const user = this.auth.currentUser();
    if (!user) return;

    if (this.passwordForm.currentPassword !== user.password) {
      this.toast.show(this.i18n.t('currentPasswordIncorrect'), 'error');
      return;
    }

    if (this.passwordForm.newPassword.length < 8 || this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.toast.show(this.i18n.t('newPasswordInvalid'), 'error');
      return;
    }

    this.auth.updateCurrentUser({
      ...user,
      password: this.passwordForm.newPassword
    });
    this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.toast.show(this.i18n.t('passwordUpdated'));
  }

  savePreferences(): void {
    this.i18n.setLanguage(this.settings.language);
    this.storage.set(this.settingsKey(), this.settings);
    this.toast.show(this.i18n.t('preferencesSaved'));
  }

  setLanguage(language: string): void {
    const nextLanguage: AppLanguage = language === 'ar' ? 'ar' : 'en';
    this.settings.language = nextLanguage;
    this.i18n.setLanguage(nextLanguage);
    if (this.profileForm.address && this.profileForm.address.trim()) {
      this.profileForm.address = translateAddress(this.profileForm.address, nextLanguage);
    }
    this.storage.set(this.settingsKey(), this.settings);
  }

  setProfileVisibility(value: string): void {
    this.settings.profileVisibility = value === 'members' ? 'members' : 'private';
  }

  setChatbotTone(value: string): void {
    this.settings.chatbotTone = value === 'direct' || value === 'luxury' ? value : 'friendly';
  }

  setDarkMode(isDark: boolean): void {
    this.theme.setDark(isDark);
  }

  clearChatForCurrentUser(): void {
    const user = this.auth.currentUser();
    const key = `gnouby_chat_history_v2_${user?.id || 'guest'}`;
    this.storage.remove(key);
    this.toast.show(this.i18n.t('chatHistoryCleared'));
  }

  deleteAccount(): void {
    if (this.deleteConfirm !== 'DELETE') {
      this.toast.show(this.i18n.t('typeDeleteToConfirm'), 'error');
      return;
    }

    this.auth.deleteCurrentUser();
    this.toast.show(this.i18n.t('accountDeleted'));
  }

  private settingsKey(): string {
    return `gnouby_settings_${this.auth.currentUser()?.id || 'guest'}`;
  }
}
