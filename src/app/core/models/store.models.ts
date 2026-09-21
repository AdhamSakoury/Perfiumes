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
  expiresAt?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discount: number;
  discountPercent: number;
  expiresAt: string;
  createdAt: string;
  createdByEmail: string;
  isActive: boolean;
  isExpired: boolean;
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
  phone?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type OrderStatus = 'Pending' | 'Processing' | 'OnHold' | 'Packed' | 'ReadyForPickup' | 'Shipped' | 'OutForDelivery' | 'Delivered' | 'Cancelled';

export interface OrderTrackingEvent {
  id: string;
  status: OrderStatus | string;
  title: string;
  description: string;
  createdAt: string;
}

export interface Order {
  id: string;
  clientRequestId?: string | null;
  userEmail?: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shippingFee?: number;
  total: number;
  onlinePaymentAmount?: number;
  amountDueAtDelivery?: number;
  paymentMethod?: 'cashOnDelivery' | 'wallet' | 'card' | 'instapay' | string;
  paymentStatus?: 'pending' | 'paid' | 'partiallyPaid' | 'failed' | 'refunded' | string;
  paymentProvider?: string;
  paymentReference?: string;
  deliveryZoneId?: string | null;
  deliveryZoneName?: string | null;
  deliveryAreaId?: string | null;
  deliveryAreaName?: string | null;
  deliveryUserId?: string | null;
deliveryName?: string | null;
  deliveryPhone?: string | null;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  deliveryLocationUpdatedAt?: string | null;
  courierName?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  shippingAddress: ShippingAddress;
  promoCode: string | null;
  trackingEvents?: OrderTrackingEvent[];
  deliveryRating?: number | null;
  deliveryRatingComment?: string | null;
  customerRating?: number | null;
  customerRatingComment?: string | null;
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
  role?: 'customer' | 'admin' | 'delivery';
}

export interface AuthResult {
  success: boolean;
  message?: string;
  emailSent?: boolean;
  devActivationUrl?: string;
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
  messageType?: 'text' | 'image' | 'audio' | string;
  mediaUrl?: string | null;
  fileName?: string | null;
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

export interface OrderConversation {
  id: string;
  orderId: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: OrderMessage[];
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

export interface AdminWalletTransaction extends WalletTransaction {
  walletId: string;
  userName: string;
  userEmail: string;
  currency: string;
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
  averageOrderValue: number;
  pendingOrders: number;
  lowStockProducts: number;
  recentOrders: AdminDashboardOrder[];
  wallets: AdminWallet[];
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  profilePhoto: string | null;
  role: 'admin' | 'customer' | 'delivery' | string;
  phone: string;
  address: string;
  authProvider: 'local' | 'google' | string;
  isEmailConfirmed: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  blockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ordersCount: number;
  walletBalance: number;
}




export interface OrderMessage {
  id: string;
  orderId: string;
  senderRole: 'customer' | 'delivery' | 'admin' | string;
  senderName: string;
  senderEmail: string;
  message: string;
  createdAt: string;
  messageType?: 'text' | 'image' | 'audio' | string;
  mediaUrl?: string | null;
  fileName?: string | null;
}

export interface ProductReview {
  id: string;
  productId: number;
  orderId: string;
  userEmail: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface DeliveryRating {
  id: string;
  orderId: string;
  deliveryUserId: string;
  userEmail: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface OrderRatingsStatus {
  hasRatedDelivery: boolean;
  deliveryRating?: number | null;
  deliveryComment?: string | null;
  productReviews: ProductReview[];
  hasRatedCustomer: boolean;
  customerRating?: number | null;
  customerComment?: string | null;
}

export interface CustomerRating {
  id: string;
  orderId: string;
  deliveryUserId: string;
  userEmail: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ============================================================
// Finance Models
// ============================================================

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  description: string | null;
  date: string;
  createdByEmail: string;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseRequest {
  title: string;
  category: string;
  amount: number;
  description?: string | null;
  date?: string | null;
  receiptUrl?: string | null;
}

export interface UpdateExpenseRequest {
  title: string;
  category: string;
  amount: number;
  description?: string | null;
  date?: string | null;
  receiptUrl?: string | null;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalTransactions: number;
  revenueChangePercent: number;
  expensesChangePercent: number;
  netProfitChangePercent: number;
}

export interface FinancialFlowPoint {
  label: string;
  revenue: number;
  expenses: number;
  netProfit: number;
}

export interface ExpenseCategory {
  category: string;
  amount: number;
  percentage: number;
}

export type FinancePeriod =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'custom';

export interface DeliveryZoneArea {
  id: string;
  name: string;
  fee: number;
  sortOrder: number;
  isActive: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  cityRegion: string;
  minFee: number;
  maxFee: number;
  fixedFee: number;
  defaultFee: number;
  pricingType: 'fixed' | 'range' | 'distance' | string;
  estimatedDays: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  areas: DeliveryZoneArea[];
}

export interface CheckoutQuote {
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  paymentMethod: string;
  onlinePaymentAmount: number;
  amountDueAtDelivery: number;
  deliveryZoneId: string;
  deliveryZoneName: string;
  deliveryAreaId?: string | null;
  deliveryAreaName?: string | null;
  estimatedDays: number;
}

export interface DetectedLocationResult {
  success: boolean;
  formattedAddress: string;
  city: string;
  governorate: string;
  zoneId: string;
  zoneName: string;
  areaId?: string | null;
  areaName?: string | null;
  shippingFee: number;
  estimatedDays: number;
  message?: string;
}

export interface UpsertDeliveryZone {
  name: string;
  cityRegion: string;
  pricingType: string;
  minFee: number;
  maxFee: number;
  fixedFee: number;
  defaultFee: number;
  estimatedDays: number;
  sortOrder: number;
  isActive: boolean;
  areas: Array<{
    id?: string;
    name: string;
    fee: number;
    sortOrder: number;
    isActive: boolean;
  }>;
}