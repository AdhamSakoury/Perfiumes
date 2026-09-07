import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((module) => module.HomePageComponent),
    title: 'Gnouby Perfumes'
  },
  {
    path: 'perfumes',
    loadComponent: () => import('./features/perfumes/perfumes.component').then((module) => module.PerfumesPageComponent),
    title: 'Perfumes | Gnouby'
  },
  {
    path: 'perfumes/:id',
    loadComponent: () => import('./features/perfume-details/perfume-details.component').then((module) => module.PerfumeDetailsPageComponent),
    title: 'Perfume Details | Gnouby'
  },
  {
    path: 'wishlist',
    loadComponent: () => import('./features/wishlist/wishlist.component').then((module) => module.WishlistPageComponent),
    title: 'Wishlist | Gnouby'
  },
  {
    path: 'cart',
    loadComponent: () => import('./features/cart/cart.component').then((module) => module.CartPageComponent),
    title: 'Cart | Gnouby'
  },
  {
    path: 'checkout',
    loadComponent: () => import('./features/checkout/checkout.component').then((module) => module.CheckoutPageComponent),
    title: 'Checkout | Gnouby'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((module) => module.LoginPageComponent),
    title: 'Login | Gnouby'
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then((module) => module.RegisterPageComponent),
    title: 'Register | Gnouby'
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then((module) => module.ForgotPasswordComponent),
    title: 'Forgot Password | Gnouby'
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password/reset-password.component').then((module) => module.ResetPasswordComponent),
    title: 'Reset Password | Gnouby'
  },
  {
    path: 'otp-verify',
    loadComponent: () => import('./features/auth/otp-verify/otp-verify.component').then((module) => module.OtpVerifyComponent),
    title: 'Verify OTP | Gnouby'
  },
  {
    path: 'resend-confirmation',
    loadComponent: () => import('./features/auth/resend-confirmation/resend-confirmation.component').then((module) => module.ResendConfirmationComponent),
    title: 'Resend Confirmation | Gnouby'
  },
  {
    path: 'activate',
    loadComponent: () => import('./features/auth/activate-account/activate-account.component').then((module) => module.ActivateAccountComponent),
    title: 'Activate Account | Gnouby'
  },
  {
    path: 'google-callback',
    loadComponent: () => import('./features/auth/google-callback/google-callback.component').then((module) => module.GoogleCallbackComponent),
    title: 'Google Callback | Gnouby'
  },
  {
    path: 'onboarding-owner',
    loadComponent: () => import('./features/auth/onboarding-owner/onboarding-owner.component').then((module) => module.OnboardingOwnerComponent),
    title: 'Owner Onboarding | Gnouby'
  },
  {
    path: 'onboarding-tenant',
    loadComponent: () => import('./features/auth/onboarding-tenant/onboarding-tenant.component').then((module) => module.OnboardingTenantComponent),
    title: 'Tenant Onboarding | Gnouby'
  },
  {
    path: 'account',
    loadComponent: () => import('./features/account/account.component').then((module) => module.AccountPageComponent),
    title: 'Account | Gnouby'
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then((module) => module.SettingsPageComponent),
    title: 'Settings | Gnouby'
  },
  {
    path: 'messages',
    loadComponent: () => import('./features/support-messages/support-messages.component').then((module) => module.SupportMessagesComponent),
    title: 'Messages | Gnouby'
  },
  {
    path: 'wallet',
    loadComponent: () => import('./features/wallet/wallet.component').then((module) => module.WalletPageComponent),
    title: 'Wallet | Gnouby'
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard.component').then((module) => module.AdminDashboardComponent),
    title: 'Admin Dashboard | Gnouby'
  },
  {
    path: 'admin/products',
    loadComponent: () => import('./features/admin/admin-products/admin-products.component').then((module) => module.AdminProductsComponent),
    title: 'Admin Products | Gnouby'
  },
  {
    path: 'admin/messages',
    loadComponent: () => import('./features/admin/admin-messages/admin-messages.component').then((module) => module.AdminMessagesComponent),
    title: 'Admin Messages | Gnouby'
  },
  {
    path: 'admin/orders',
    loadComponent: () => import('./features/admin/admin-orders/admin-orders.component').then((module) => module.AdminOrdersComponent),
    title: 'Admin Orders | Gnouby'
  },
  {
    path: 'admin/wallets',
    loadComponent: () => import('./features/admin/admin-wallets/admin-wallets.component').then((module) => module.AdminWalletsComponent),
    title: 'Admin Wallets | Gnouby'
  },
  {
    path: 'admin/promos',
    loadComponent: () => import('./features/admin/admin-promos/admin-promos.component').then((module) => module.AdminPromosComponent),
    title: 'Admin Promo Codes | Gnouby'
  },
  {
    path: 'admin/users',
    loadComponent: () => import('./features/admin/admin-users/admin-users.component').then((module) => module.AdminUsersComponent),
    title: 'Admin Users | Gnouby'
  },
  {
    path: 'orders',
    loadComponent: () => import('./features/orders/orders.component').then((module) => module.OrdersPageComponent),
    title: 'Orders | Gnouby'
  },
  {
    path: 'payment-result',
    loadComponent: () => import('./features/payment-result/payment-result.component').then((module) => module.PaymentResultComponent),
    title: 'Payment Result | Gnouby'
  },
  {
    path: 'about',
    redirectTo: 'policies/about'
  },
  {
    path: 'faq',
    redirectTo: 'policies/faq'
  },
  {
    path: 'policies/:type',
    loadComponent: () => import('./features/policies/policies.component').then((module) => module.PoliciesPageComponent),
    title: 'Policies | Gnouby'
  },
  { path: '**', redirectTo: '' }
];
