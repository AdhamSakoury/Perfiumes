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

export type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  shippingAddress: ShippingAddress;
  promoCode: string | null;
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
}

export interface AuthResult {
  success: boolean;
  message?: string;
  user?: User;
}

export interface ProductFilters {
  gender: string[];
  rating: number;
  brands: string[];
  priceMin: number;
  priceMax: number;
}

