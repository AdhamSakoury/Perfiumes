import { Routes } from '@angular/router';
import { AccountPageComponent } from './features/account/account.component';
import { AdminProductsComponent } from './features/admin/admin-products/admin-products.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard/admin-dashboard.component';
import { AdminMessagesComponent } from './features/admin/admin-messages/admin-messages.component';
import { AdminOrdersComponent } from './features/admin/admin-orders/admin-orders.component';
import { CartPageComponent } from './features/cart/cart.component';
import { CheckoutPageComponent } from './features/checkout/checkout.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { GoogleCallbackComponent } from './features/auth/google-callback/google-callback.component';
import { HomePageComponent } from './features/home/home.component';
import { LoginPageComponent } from './features/auth/login/login.component';
import { OnboardingOwnerComponent } from './features/auth/onboarding-owner/onboarding-owner.component';
import { OnboardingTenantComponent } from './features/auth/onboarding-tenant/onboarding-tenant.component';
import { OrdersPageComponent } from './features/orders/orders.component';
import { OtpVerifyComponent } from './features/auth/otp-verify/otp-verify.component';
import { PerfumeDetailsPageComponent } from './features/perfume-details/perfume-details.component';
import { PerfumesPageComponent } from './features/perfumes/perfumes.component';
import { ResendConfirmationComponent } from './features/auth/resend-confirmation/resend-confirmation.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';
import { RegisterPageComponent } from './features/auth/register/register.component';
import { SettingsPageComponent } from './features/settings/settings.component';
import { SupportMessagesComponent } from './features/support-messages/support-messages.component';
import { WishlistPageComponent } from './features/wishlist/wishlist.component';

export const routes: Routes = [
  { path: '', component: HomePageComponent, title: 'Gnouby Perfumes' },
  { path: 'perfumes', component: PerfumesPageComponent, title: 'Perfumes | Gnouby' },
  { path: 'perfumes/:id', component: PerfumeDetailsPageComponent, title: 'Perfume Details | Gnouby' },
  { path: 'wishlist', component: WishlistPageComponent, title: 'Wishlist | Gnouby' },
  { path: 'cart', component: CartPageComponent, title: 'Cart | Gnouby' },
  { path: 'checkout', component: CheckoutPageComponent, title: 'Checkout | Gnouby' },
  { path: 'login', component: LoginPageComponent, title: 'Login | Gnouby' },
  { path: 'register', component: RegisterPageComponent, title: 'Register | Gnouby' },
  { path: 'forgot-password', component: ForgotPasswordComponent, title: 'Forgot Password | Gnouby' },
  { path: 'reset-password', component: ResetPasswordComponent, title: 'Reset Password | Gnouby' },
  { path: 'otp-verify', component: OtpVerifyComponent, title: 'Verify OTP | Gnouby' },
  { path: 'resend-confirmation', component: ResendConfirmationComponent, title: 'Resend Confirmation | Gnouby' },
  { path: 'google-callback', component: GoogleCallbackComponent, title: 'Google Callback | Gnouby' },
  { path: 'onboarding-owner', component: OnboardingOwnerComponent, title: 'Owner Onboarding | Gnouby' },
  { path: 'onboarding-tenant', component: OnboardingTenantComponent, title: 'Tenant Onboarding | Gnouby' },
  { path: 'account', component: AccountPageComponent, title: 'Account | Gnouby' },
  { path: 'settings', component: SettingsPageComponent, title: 'Settings | Gnouby' },
  { path: 'messages', component: SupportMessagesComponent, title: 'Messages | Gnouby' },
  { path: 'admin', component: AdminDashboardComponent, title: 'Admin Dashboard | Gnouby' },
  { path: 'admin/products', component: AdminProductsComponent, title: 'Admin Products | Gnouby' },
  { path: 'admin/messages', component: AdminMessagesComponent, title: 'Admin Messages | Gnouby' },
  { path: 'admin/orders', component: AdminOrdersComponent, title: 'Admin Orders | Gnouby' },
  { path: 'orders', component: OrdersPageComponent, title: 'Orders | Gnouby' },
  { path: '**', redirectTo: '' }
];

