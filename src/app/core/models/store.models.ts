export interface Perfume {
  id: number;
  name: string;
  brand: string;
  price: number;
  rating: number;
  gender: 'Men' | 'Women' | 'Unisex' | string;
  image: string;
  description: string;
  category: string;
  notes: string[];
  concentration: string;
  season: string[];
  stockQuantity?: number;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PriceRange {
  label: string;
  min: number;
  max: number;
}

export interface FiltersConfig {
  gender: string[];
  category: string[];
  priceRange: PriceRange[];
  concentration: string[];
  season: string[];
  rating: number[];
}

export interface PromoCodes {
  [code: string]: number;
}

export interface CartItem {
  perfumeId: number;
  quantity: number;
}

export interface CartLine extends CartItem {
  perfume: Perfume;
  lineTotal: number;
}

export interface PromoData {
  code: string;
  discount: number;
}

export interface OrderItem {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

export interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type OrderStatus = 'Pending' | 'Processing' | 'Packed' | 'Shipped' | 'OutForDelivery' | 'Delivered' | 'Cancelled';

export interface OrderTrackingEvent {
  id: string;
  status: OrderStatus | string;
  title: string;
  description: string;
  createdAt: string;
}

export interface Order {
  id: string;
  userEmail?: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  shippingAddress: ShippingAddress;
  promoCode: string | null;
  trackingEvents?: OrderTrackingEvent[];
}

export interface User {
  id: string;
  fullName: string;
  name: string;
  email: string;
  password: string;
  phone: string;
  address: string;
  profilePhoto: string | null;
  orders: Order[];
  wishlist: number[];
  createdAt: string;
  updatedAt: string;
  authProvider?: 'local' | 'google';
  role?: 'customer' | 'admin';
}

export interface AuthResult {
  success: boolean;
  message?: string;
  user?: User;
  accessToken?: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderRole: 'customer' | 'admin' | string;
  senderName: string;
  senderEmail: string;
  body: string;
  createdAt: string;
}

export interface SupportConversation {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: 'open' | 'answered' | 'closed' | string;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
}

export interface ProductFilters {
  gender: string[];
  rating: number;
  brands: string[];
  priceMin: number;
  priceMax: number;
}

export interface ChatbotMessageResponse {
  reply: string;
  suggestedProducts: Perfume[];
}

export interface AdminDashboardOrder {
  id: string;
  userEmail: string;
  status: OrderStatus | string;
  total: number;
  date: string;
}

export interface AdminWallet {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  balance: number;
  lifetimeCredit: number;
  lifetimeDebit: number;
  currency: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit' | string;
  reason: string;
  referenceId: string | null;
  createdAt: string;
}

export interface UserWallet {
  id: string;
  balance: number;
  lifetimeCredit: number;
  lifetimeDebit: number;
  currency: string;
  updatedAt: string;
  transactions: WalletTransaction[];
}

export interface AdminDashboardSummary {
  totalUsers: number;
  totalCustomers: number;
  totalProducts: number;
  totalOrders: number;
  openSupportMessages: number;
  revenue: number;
  walletBalance: number;
  recentOrders: AdminDashboardOrder[];
  wallets: AdminWallet[];
}

