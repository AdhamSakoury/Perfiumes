import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  CreateExpenseRequest,
  Expense,
  ExpenseCategory,
  FinancialFlowPoint,
  FinancialSummary,
  FinancePeriod,
  UpdateExpenseRequest,
} from '@core/models/store.models';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

const STORAGE_KEY = 'gnouby_admin_expenses';

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly expensesSubject = new BehaviorSubject<Expense[]>(this.loadInitialExpenses());
  readonly expenses$ = this.expensesSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  getDefaultDemoExpenses(): Expense[] {
    const now = new Date();
    const isoDate = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    return [
      {
        id: 'EXP-8901',
        title: 'Meta & Instagram Fragrance Ads Campaign',
        category: 'Marketing',
        amount: 8500,
        description: 'Sponsored video promotion for Nubian Amber and Royal Lotus launch across Cairo and Alexandria.',
        date: isoDate(1),
        createdByEmail: 'admin@gnouby.local',
        receiptUrl: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80',
        createdAt: isoDate(1),
        updatedAt: isoDate(1),
      },
      {
        id: 'EXP-8902',
        title: 'Luxury Gold-Foil Packaging Bottles (Batch 400)',
        category: 'Packaging',
        amount: 14200,
        description: 'Custom embossed amber crystal bottles and black velvet presentation boxes from Alexandria glassworks.',
        date: isoDate(3),
        createdByEmail: 'admin@gnouby.local',
        receiptUrl: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
        createdAt: isoDate(3),
        updatedAt: isoDate(3),
      },
      {
        id: 'EXP-8903',
        title: 'Courier Logistics & Local Delivery Settlements',
        category: 'Logistics',
        amount: 3600,
        description: 'Weekly settlement for express courier deliveries covering Greater Cairo, Giza, and Delta regions.',
        date: isoDate(5),
        createdByEmail: 'admin@gnouby.local',
        receiptUrl: null,
        createdAt: isoDate(5),
        updatedAt: isoDate(5),
      },
      {
        id: 'EXP-8904',
        title: 'Warehouse & Showroom Electricity & Cooling',
        category: 'Utilities',
        amount: 2450,
        description: 'Monthly electricity bill for temperature-controlled fragrance storage facility.',
        date: isoDate(8),
        createdByEmail: 'admin@gnouby.local',
        receiptUrl: null,
        createdAt: isoDate(8),
        updatedAt: isoDate(8),
      },
      {
        id: 'EXP-8905',
        title: 'Perfumer Laboratory Essential Oils & Resins',
        category: 'Inventory',
        amount: 19800,
        description: 'Imported pure Agarwood (Oud), Egyptian Jasmine absolute, and natural Frankincense resin.',
        date: isoDate(12),
        createdByEmail: 'admin@gnouby.local',
        receiptUrl: 'https://images.unsplash.com/photo-1615397349754-cfa2066a298e?auto=format&fit=crop&w=800&q=80',
        createdAt: isoDate(12),
        updatedAt: isoDate(12),
      },
    ];
  }

  getStoredExpenses(): Expense[] {
    return this.expensesSubject.getValue();
  }

  saveStoredExpenses(list: Expense[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) {}
    this.expensesSubject.next(list);
  }

  addStoredExpense(item: Expense): void {
    const current = this.getStoredExpenses();
    const updated = [item, ...current.filter(e => e.id !== item.id)];
    this.saveStoredExpenses(updated);
  }

  updateStoredExpense(id: string, partial: Partial<Expense>): void {
    const current = this.getStoredExpenses();
    const updated: Expense[] = current.map(item =>
      item.id === id
        ? {
            ...item,
            ...partial,
            date: partial.date || item.date,
            updatedAt: new Date().toISOString(),
          }
        : item
    );
    this.saveStoredExpenses(updated);
  }

  deleteStoredExpense(id: string): void {
    const current = this.getStoredExpenses();
    const updated = current.filter(item => item.id !== id);
    this.saveStoredExpenses(updated);
  }

  filterExpensesByPeriod(list: Expense[], period: FinancePeriod, startDate?: string, endDate?: string): Expense[] {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(start.getTime() + 86400000);
        break;
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this-week':
        start = new Date(now.getTime() - 7 * 86400000);
        break;
      case 'last-week':
        start = new Date(now.getTime() - 14 * 86400000);
        end = new Date(now.getTime() - 7 * 86400000);
        break;
      case 'this-month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'last-month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this-year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear() + 1, 0, 1);
        break;
      case 'last-year':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(new Date(endDate).getTime() + 86400000);
        } else {
          return list;
        }
        break;
      default:
        return list;
    }

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    return list.filter(item => {
      const d = item.date || item.createdAt;
      return d >= startIso && d < endIso;
    });
  }

  computeExpenseCategories(list: Expense[], period: FinancePeriod, startDate?: string, endDate?: string): ExpenseCategory[] {
    const filtered = this.filterExpensesByPeriod(list, period, startDate, endDate);
    const total = filtered.reduce((sum, item) => sum + item.amount, 0);
    if (total === 0) return [];

    const map: Record<string, number> = {};
    for (const item of filtered) {
      map[item.category] = (map[item.category] || 0) + item.amount;
    }

    return Object.entries(map)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: Math.round((amount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  getFinancialSummary(
    token: string,
    period: FinancePeriod,
    startDate?: string,
    endDate?: string
  ): Observable<FinancialSummary> {
    let params = new HttpParams().set('period', period);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    return this.http.get<FinancialSummary>(
      `${environment.apiBaseUrl}/api/admin/dashboard/financial-summary`,
      { headers: this.authHeaders(token), params }
    );
  }

  getFinancialFlow(
    token: string,
    period: FinancePeriod,
    startDate?: string,
    endDate?: string
  ): Observable<FinancialFlowPoint[]> {
    let params = new HttpParams().set('period', period);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    return this.http.get<FinancialFlowPoint[]>(
      `${environment.apiBaseUrl}/api/admin/dashboard/financial-flow`,
      { headers: this.authHeaders(token), params }
    );
  }

  getExpenseCategories(
    token: string,
    period: FinancePeriod,
    startDate?: string,
    endDate?: string
  ): Observable<ExpenseCategory[]> {
    let params = new HttpParams().set('period', period);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);
    return this.http.get<ExpenseCategory[]>(
      `${environment.apiBaseUrl}/api/admin/dashboard/expense-categories`,
      { headers: this.authHeaders(token), params }
    );
  }

  getExpenses(
    token: string,
    search?: string,
    category?: string,
    startDate?: string,
    endDate?: string
  ): Observable<Expense[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (category) params = params.set('category', category);
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<Expense[]>(
      `${environment.apiBaseUrl}/api/admin/expenses`,
      { headers: this.authHeaders(token), params }
    ).pipe(
      tap((remote) => {
        if (remote && remote.length > 0) {
          this.saveStoredExpenses(remote);
        }
      }),
      catchError(() => {
        let stored = this.getStoredExpenses();
        if (category) stored = stored.filter(e => e.category === category);
        if (search) {
          const s = search.toLowerCase();
          stored = stored.filter(e => e.title.toLowerCase().includes(s) || (e.description || '').toLowerCase().includes(s));
        }
        return of(stored);
      })
    );
  }

  createExpense(request: CreateExpenseRequest, token: string): Observable<Expense> {
    return this.http.post<Expense>(
      `${environment.apiBaseUrl}/api/admin/expenses`,
      request,
      { headers: this.authHeaders(token) }
    ).pipe(
      tap((created) => {
        if (created) this.addStoredExpense(created);
      }),
      catchError(() => {
        const fallback: Expense = {
          id: `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
          title: request.title,
          category: request.category,
          amount: request.amount,
          description: request.description || null,
          date: request.date || new Date().toISOString(),
          createdByEmail: 'admin@gnouby.local',
          receiptUrl: request.receiptUrl || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.addStoredExpense(fallback);
        return of(fallback);
      })
    );
  }

  updateExpense(id: string, request: UpdateExpenseRequest, token: string): Observable<Expense> {
    return this.http.put<Expense>(
      `${environment.apiBaseUrl}/api/admin/expenses/${id}`,
      request,
      { headers: this.authHeaders(token) }
    ).pipe(
      tap((updated) => {
        if (updated) this.updateStoredExpense(id, updated);
      }),
      catchError(() => {
        const partial: Partial<Expense> = {
          title: request.title,
          category: request.category,
          amount: request.amount,
          description: request.description || null,
          receiptUrl: request.receiptUrl || null,
          ...(request.date ? { date: request.date } : {}),
        };
        this.updateStoredExpense(id, partial);
        const item = this.getStoredExpenses().find(e => e.id === id);
        return of(item as Expense);
      })
    );
  }

  deleteExpense(id: string, token: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiBaseUrl}/api/admin/expenses/${id}`,
      { headers: this.authHeaders(token) }
    ).pipe(
      tap(() => {
        this.deleteStoredExpense(id);
      }),
      catchError(() => {
        this.deleteStoredExpense(id);
        return of(void 0);
      })
    );
  }

  private loadInitialExpenses(): Expense[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    const defaults = this.getDefaultDemoExpenses();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    } catch (_) {}
    return defaults;
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
