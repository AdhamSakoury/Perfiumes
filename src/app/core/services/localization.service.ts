import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';

export type AppLanguage = 'en' | 'ar';

const LANGUAGE_KEY = 'gnouby_language';

const TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  en: {
    home: 'Home',
    perfumes: 'Perfumes',
    wishlist: 'Wishlist',
    cart: 'Cart',
    admin: 'Admin',
    account: 'Account',
    settings: 'Settings',
    orders: 'Orders',
    login: 'Login',
    register: 'Register',
    logout: 'Logout',
    notifications: 'Notifications',
    noNotifications: 'No notifications yet',
    markAllRead: 'Mark all read',
    profile: 'Profile',
    password: 'Password',
    preferences: 'Preferences',
    chatbot: 'Chatbot',
    dangerZone: 'Danger Zone',
    accountCenter: 'Account Center',
    settingsSubtitle: 'Manage your profile, preferences, privacy, and admin tools.',
    profileInformation: 'Profile Information',
    updatePublicDetails: 'Update your public account details.',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    saveProfile: 'Save profile',
    passwordSecurity: 'Password & Security',
    changeLocalPassword: 'Change your local test account password.',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Confirm password',
    updatePassword: 'Update password',
    darkMode: 'Dark mode',
    darkModeHint: 'Switch between light and dark display.',
    emailNotifications: 'Email notifications',
    emailNotificationsHint: 'Receive account and activity updates.',
    orderUpdates: 'Order updates',
    orderUpdatesHint: 'Get notified when order status changes.',
    promotions: 'Promotions',
    promotionsHint: 'Receive offers and product drops.',
    language: 'Language',
    profilePrivacy: 'Profile privacy',
    savePreferences: 'Save preferences',
    chatbotSettings: 'Chatbot Settings',
    chatbotSettingsHint: 'Control assistant memory and tone for this account.',
    saveChatHistory: 'Save chat history',
    saveChatHistoryHint: 'Keep chatbot history separated per account.',
    assistantTone: 'Assistant tone',
    saveChatbotSettings: 'Save chatbot settings',
    clearChatHistory: 'Clear my chat history',
    adminSettings: 'Admin Settings',
    adminSettingsHint: 'Store and product management shortcuts.',
    manageProducts: 'Manage products',
    viewStorefront: 'View storefront',
    deleteAccountHint: 'Delete this local test account from the browser.',
    typeDelete: 'Type DELETE to confirm',
    deleteAccount: 'Delete account'
  },
  ar: {
    home: 'الرئيسية',
    perfumes: 'العطور',
    wishlist: 'المفضلة',
    cart: 'السلة',
    admin: 'الإدارة',
    account: 'الحساب',
    settings: 'الإعدادات',
    orders: 'الطلبات',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    notifications: 'الإشعارات',
    noNotifications: 'لا توجد إشعارات بعد',
    markAllRead: 'تحديد الكل كمقروء',
    profile: 'الملف الشخصي',
    password: 'كلمة المرور',
    preferences: 'التفضيلات',
    chatbot: 'المساعد',
    dangerZone: 'منطقة الخطر',
    accountCenter: 'مركز الحساب',
    settingsSubtitle: 'تحكم في بياناتك، التفضيلات، الخصوصية، وأدوات الإدارة.',
    profileInformation: 'بيانات الحساب',
    updatePublicDetails: 'حدّث بيانات حسابك الأساسية.',
    fullName: 'الاسم بالكامل',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    address: 'العنوان',
    saveProfile: 'حفظ البيانات',
    passwordSecurity: 'كلمة المرور والأمان',
    changeLocalPassword: 'غيّر كلمة مرور حساب الاختبار المحلي.',
    currentPassword: 'كلمة المرور الحالية',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور',
    updatePassword: 'تحديث كلمة المرور',
    darkMode: 'الوضع الداكن',
    darkModeHint: 'بدّل بين المظهر الفاتح والداكن.',
    emailNotifications: 'إشعارات البريد',
    emailNotificationsHint: 'استقبل تحديثات الحساب والنشاط.',
    orderUpdates: 'تحديثات الطلبات',
    orderUpdatesHint: 'اعرف عند تغيّر حالة الطلب.',
    promotions: 'العروض',
    promotionsHint: 'استقبل العروض والمنتجات الجديدة.',
    language: 'اللغة',
    profilePrivacy: 'خصوصية الحساب',
    savePreferences: 'حفظ التفضيلات',
    chatbotSettings: 'إعدادات المساعد',
    chatbotSettingsHint: 'تحكم في ذاكرة ونبرة المساعد لهذا الحساب.',
    saveChatHistory: 'حفظ سجل الشات',
    saveChatHistoryHint: 'احتفظ بسجل منفصل لكل حساب.',
    assistantTone: 'نبرة المساعد',
    saveChatbotSettings: 'حفظ إعدادات المساعد',
    clearChatHistory: 'مسح سجل الشات',
    adminSettings: 'إعدادات الإدارة',
    adminSettingsHint: 'اختصارات إدارة المتجر والمنتجات.',
    manageProducts: 'إدارة المنتجات',
    viewStorefront: 'عرض المتجر',
    deleteAccountHint: 'حذف حساب الاختبار المحلي من المتصفح.',
    typeDelete: 'اكتب DELETE للتأكيد',
    deleteAccount: 'حذف الحساب'
  }
};

@Injectable({ providedIn: 'root' })
export class LocalizationService {
  readonly language = signal<AppLanguage>(this.storage.get<AppLanguage>(LANGUAGE_KEY, 'en'));

  constructor(private readonly storage: StorageService) {
    this.applyDocumentLanguage(this.language());
  }

  setLanguage(language: AppLanguage): void {
    this.storage.set(LANGUAGE_KEY, language);
    this.language.set(language);
    this.applyDocumentLanguage(language);
  }

  t(key: string): string {
    const language = this.language();
    return TRANSLATIONS[language][key] || TRANSLATIONS.en[key] || key;
  }

  isRtl(): boolean {
    return this.language() === 'ar';
  }

  private applyDocumentLanguage(language: AppLanguage): void {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = language === 'ar' ? 'rtl' : 'ltr';
  }
}
