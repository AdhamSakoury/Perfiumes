import { Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CreateExpenseRequest,
  Expense,
  UpdateExpenseRequest,
} from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { FinanceService } from '@core/services/finance.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { of, timeout, catchError } from 'rxjs';

export interface CategoryMeta {
  name: string;
  icon: string;
  colorClass: string;
  bgClass: string;
}

@Component({
  selector: 'app-admin-expenses',
  standalone: true,
  imports: [RouterLink, DatePipe, NgClass, FormsModule, TranslatePipe],
  templateUrl: './admin-expenses.component.html',
  styleUrl: './admin-expenses.component.css',
})
export class AdminExpensesComponent implements OnInit {
  expenses = signal<Expense[]>([]);
  loading = signal<boolean>(false);

  // Search & Filter state
  searchQuery = signal('');
  selectedCategory = signal('');
  startDateFilter = signal('');
  endDateFilter = signal('');
  activeDatePreset = signal<'all' | 'this-week' | 'this-month' | 'last-month' | 'custom'>('all');

  // Modal states
  showAddModal = signal(false);
  showEditModal = signal(false);
  showDeleteModal = signal(false);
  previewReceiptUrl = signal<string | null>(null);

  // Form states
  formTitle = '';
  formCategory = 'Marketing';
  formAmount: number | null = null;
  formDate = '';
  formDescription = '';
  formReceiptUrl = '';
  editingExpenseId: string | null = null;
  deletingExpense: Expense | null = null;
  saving = false;

  readonly categoriesMeta: Record<string, CategoryMeta> = {
    Marketing: { name: 'Marketing', icon: 'fa-bullhorn', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-500/10 border-amber-500/20' },
    Salaries: { name: 'Salaries', icon: 'fa-users-gear', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/20' },
    Packaging: { name: 'Packaging', icon: 'fa-box-open', colorClass: 'text-rose-600 dark:text-rose-400', bgClass: 'bg-rose-500/10 border-rose-500/20' },
    Logistics: { name: 'Logistics', icon: 'fa-truck-fast', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-500/10 border-blue-500/20' },
    Utilities: { name: 'Utilities', icon: 'fa-bolt', colorClass: 'text-yellow-600 dark:text-yellow-400', bgClass: 'bg-yellow-500/10 border-yellow-500/20' },
    Rent: { name: 'Rent', icon: 'fa-building', colorClass: 'text-purple-600 dark:text-purple-400', bgClass: 'bg-purple-500/10 border-purple-500/20' },
    Inventory: { name: 'Inventory', icon: 'fa-cubes', colorClass: 'text-teal-600 dark:text-teal-400', bgClass: 'bg-teal-500/10 border-teal-500/20' },
    Maintenance: { name: 'Maintenance', icon: 'fa-wrench', colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-500/10 border-orange-500/20' },
    Other: { name: 'Other', icon: 'fa-folder', colorClass: 'text-stone-600 dark:text-stone-400', bgClass: 'bg-stone-500/10 border-stone-500/20' },
  };

  readonly categoryNames = Object.keys(this.categoriesMeta);

  // Computed filtered list
  readonly filteredExpenses = computed(() => {
    const list = this.expenses();
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    const start = this.startDateFilter();
    const end = this.endDateFilter();

    return list.filter((item) => {
      if (category && item.category !== category) return false;
      if (query && !item.title.toLowerCase().includes(query) && !(item.description || '').toLowerCase().includes(query)) return false;
      if (start && item.date && item.date < start) return false;
      if (end && item.date && item.date.slice(0, 10) > end) return false;
      return true;
    });
  });

  // KPI Metrics
  readonly totalSum = computed(() => {
    return this.filteredExpenses().reduce((sum, item) => sum + (item.amount || 0), 0);
  });

  readonly documentedCount = computed(() => {
    return this.filteredExpenses().filter(e => !!e.receiptUrl).length;
  });

  readonly topCategory = computed(() => {
    const list = this.filteredExpenses();
    if (list.length === 0) return { name: 'None', amount: 0, percentage: 0 };
    const totals: Record<string, number> = {};
    for (const item of list) {
      totals[item.category] = (totals[item.category] || 0) + item.amount;
    }
    let topName = 'Other';
    let topAmount = 0;
    for (const [cat, amt] of Object.entries(totals)) {
      if (amt > topAmount) {
        topAmount = amt;
        topName = cat;
      }
    }
    const sum = this.totalSum();
    const percentage = sum > 0 ? Math.round((topAmount / sum) * 100) : 0;
    return { name: topName, amount: topAmount, percentage };
  });

  constructor(
    readonly auth: AuthService,
    readonly i18n: LocalizationService,
    private readonly finance: FinanceService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/finance/expenses' } });
    }
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  ngOnInit(): void {
    this.expenses.set(this.finance.getStoredExpenses());
    this.loadExpenses();
  }

  loadExpenses(): void {
    if (!this.isAdmin) return;

    this.loading.set(true);
    this.auth.ensureAccessToken().pipe(
      timeout(5000),
      catchError(() => of(this.auth.currentAccessToken()))
    ).subscribe((token) => {
      if (!token) {
        this.loading.set(false);
        if (this.expenses().length === 0) {
          this.expenses.set(this.finance.getStoredExpenses());
        }
        return;
      }

      this.finance.getExpenses(token).pipe(
        timeout(8000),
        catchError(() => of(this.finance.getStoredExpenses()))
      ).subscribe({
        next: (data) => {
          if (data && data.length > 0) {
            this.expenses.set(data);
          } else {
            this.expenses.set(this.finance.getStoredExpenses());
          }
          this.loading.set(false);
        },
        error: () => {
          this.expenses.set(this.finance.getStoredExpenses());
          this.loading.set(false);
        },
      });
    });
  }

  private setDemoExpenses(): void {
    const now = new Date();
    const isoDate = (daysAgo: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    };

    const seeds: Expense[] = [
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

    this.expenses.set(seeds);
  }

  selectCategoryFilter(cat: string): void {
    if (this.selectedCategory() === cat) {
      this.selectedCategory.set('');
    } else {
      this.selectedCategory.set(cat);
    }
  }

  setDatePreset(preset: 'all' | 'this-week' | 'this-month' | 'last-month' | 'custom'): void {
    this.activeDatePreset.set(preset);
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'all') {
      this.startDateFilter.set('');
      this.endDateFilter.set('');
    } else if (preset === 'this-week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      this.startDateFilter.set(toYmd(weekAgo));
      this.endDateFilter.set(toYmd(now));
    } else if (preset === 'this-month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      this.startDateFilter.set(toYmd(firstDay));
      this.endDateFilter.set(toYmd(now));
    } else if (preset === 'last-month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      this.startDateFilter.set(toYmd(firstDayLastMonth));
      this.endDateFilter.set(toYmd(lastDayLastMonth));
    }
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('');
    this.startDateFilter.set('');
    this.endDateFilter.set('');
    this.activeDatePreset.set('all');
  }

  openAddModal(presetCategory?: string, presetTitle?: string): void {
    const today = new Date().toISOString().split('T')[0];
    this.formTitle = presetTitle || '';
    this.formCategory = presetCategory || 'Marketing';
    this.formAmount = null;
    this.formDate = today;
    this.formDescription = '';
    this.formReceiptUrl = '';
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  openEditModal(expense: Expense): void {
    this.editingExpenseId = expense.id;
    this.formTitle = expense.title;
    this.formCategory = expense.category;
    this.formAmount = expense.amount;
    this.formDate = expense.date ? new Date(expense.date).toISOString().split('T')[0] : '';
    this.formDescription = expense.description || '';
    this.formReceiptUrl = expense.receiptUrl || '';
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingExpenseId = null;
  }

  openDeleteModal(expense: Expense): void {
    this.deletingExpense = expense;
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deletingExpense = null;
  }

  viewReceipt(url: string): void {
    this.previewReceiptUrl.set(url);
  }

  closeReceiptPreview(): void {
    this.previewReceiptUrl.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        this.formReceiptUrl = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  saveNewExpense(): void {
    if (!this.formTitle.trim() || !this.formAmount || this.formAmount <= 0) {
      this.toast.show('Please provide a valid title and positive amount.', 'error');
      return;
    }

    this.saving = true;
    const req: CreateExpenseRequest = {
      title: this.formTitle.trim(),
      category: this.formCategory,
      amount: this.formAmount,
      date: this.formDate ? new Date(this.formDate).toISOString() : new Date().toISOString(),
      description: this.formDescription.trim() || null,
      receiptUrl: this.formReceiptUrl || null,
    };

    const token = this.auth.currentAccessToken();
    if (token) {
      this.finance.createExpense(req, token).pipe(
        timeout(6000),
        catchError(() => of(null))
      ).subscribe((created) => {
        const newExpense: Expense = created || {
          id: `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
          title: req.title,
          category: req.category,
          amount: req.amount,
          description: req.description || null,
          date: req.date || new Date().toISOString(),
          createdByEmail: this.auth.currentUser()?.email || 'admin@gnouby.local',
          receiptUrl: req.receiptUrl || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.expenses.update(list => [newExpense, ...list]);
        this.saving = false;
        this.closeAddModal();
        this.toast.show('Expense recorded successfully', 'success');
      });
    } else {
      const fallbackExpense: Expense = {
        id: `EXP-${Math.floor(1000 + Math.random() * 9000)}`,
        title: req.title,
        category: req.category,
        amount: req.amount,
        description: req.description || null,
        date: req.date || new Date().toISOString(),
        createdByEmail: this.auth.currentUser()?.email || 'admin@gnouby.local',
        receiptUrl: req.receiptUrl || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.finance.addStoredExpense(fallbackExpense);
      this.expenses.update(list => [fallbackExpense, ...list]);
      this.saving = false;
      this.closeAddModal();
      this.toast.show('Expense recorded successfully', 'success');
    }
  }

  updateExpense(): void {
    if (!this.editingExpenseId || !this.formTitle.trim() || !this.formAmount || this.formAmount <= 0) {
      this.toast.show('Please provide a valid title and positive amount.', 'error');
      return;
    }

    this.saving = true;
    const req: UpdateExpenseRequest = {
      title: this.formTitle.trim(),
      category: this.formCategory,
      amount: this.formAmount,
      date: this.formDate ? new Date(this.formDate).toISOString() : null,
      description: this.formDescription.trim() || null,
      receiptUrl: this.formReceiptUrl || null,
    };

    const token = this.auth.currentAccessToken();
    const id = this.editingExpenseId;

    if (token) {
      this.finance.updateExpense(id, req, token).pipe(
        timeout(6000),
        catchError(() => of(null))
      ).subscribe((updated) => {
        this.expenses.update(list => list.map(item => {
          if (item.id === id) {
            return updated || {
              ...item,
              title: req.title,
              category: req.category,
              amount: req.amount,
              description: req.description || null,
              date: req.date || item.date,
              receiptUrl: req.receiptUrl || item.receiptUrl,
              updatedAt: new Date().toISOString(),
            };
          }
          return item;
        }));
        this.saving = false;
        this.closeEditModal();
        this.toast.show('Expense updated successfully', 'success');
      });
    } else {
      this.expenses.update(list => list.map(item => {
        if (item.id === id) {
          const updatedItem: Expense = {
            ...item,
            title: req.title,
            category: req.category,
            amount: req.amount,
            description: req.description || null,
            date: req.date || item.date,
            receiptUrl: req.receiptUrl || item.receiptUrl,
            updatedAt: new Date().toISOString(),
          };
          this.finance.updateStoredExpense(id, updatedItem);
          return updatedItem;
        }
        return item;
      }));
      this.saving = false;
      this.closeEditModal();
      this.toast.show('Expense updated successfully', 'success');
    }
  }

  confirmDelete(): void {
    if (!this.deletingExpense) return;
    const id = this.deletingExpense.id;
    this.saving = true;

    const token = this.auth.currentAccessToken();
    if (token) {
      this.finance.deleteExpense(id, token).pipe(
        timeout(6000),
        catchError(() => of(null))
      ).subscribe(() => {
        this.expenses.update(list => list.filter(item => item.id !== id));
        this.saving = false;
        this.closeDeleteModal();
        this.toast.show('Expense removed', 'success');
      });
    } else {
      this.finance.deleteStoredExpense(id);
      this.expenses.update(list => list.filter(item => item.id !== id));
      this.saving = false;
      this.closeDeleteModal();
      this.toast.show('Expense removed', 'success');
    }
  }

  exportPdf(): void {
    const list = this.filteredExpenses();
    const isAr = this.i18n.language() === 'ar';
    if (list.length === 0) {
      this.toast.show(isAr ? 'لا توجد مصروفات لتصديرها' : 'No expenses to export.', 'error');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=950,height=800');
    if (!printWindow) {
      this.toast.show('Please allow popups to generate the PDF report.', 'error');
      return;
    }

    const total = this.totalSum();
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const categorySummary = this.categoryNames
      .map(cat => {
        const catTotal = list.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
        return { cat, total: catTotal };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);

    const rowsHtml = list.map((e, index) => `
      <tr>
        <td style="text-align: center; color: #78716c; font-size: 11px;">${index + 1}</td>
        <td style="font-weight: 700; color: #153f3f;">
          ${e.title}
          ${e.description ? `<div style="font-size: 11px; font-weight: normal; color: #78716c; margin-top: 2px;">${e.description}</div>` : ''}
        </td>
        <td>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e;">
            ${this.getCategoryLabel(e.category)}
          </span>
        </td>
        <td style="font-size: 12px; color: #57534e; white-space: nowrap;">
          ${e.date ? new Date(e.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-EG') : '—'}
        </td>
        <td style="text-align: right; font-weight: 800; color: #b91c1c; white-space: nowrap;">
          ${e.amount.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
        </td>
        <td style="text-align: center; font-size: 11px; color: ${e.receiptUrl ? '#047857' : '#a8a29e'}; font-weight: 600;">
          ${e.receiptUrl ? (isAr ? 'مرفق' : 'Attached') : (isAr ? 'غير متوفر' : 'None')}
        </td>
      </tr>
    `).join('');

    const categoriesChipsHtml = categorySummary.map(c => `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 12px; text-align: center;">
        <div style="font-size: 10px; color: #64748b; font-weight: 600;">${this.getCategoryLabel(c.cat)}</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 1px;">
          ${c.total.toLocaleString('en-EG')} EGP
        </div>
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
      <head>
        <meta charset="utf-8">
        <title>GNOUBY - Expenses Report (${dateStr})</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: ${isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif"};
            color: #1e293b;
            background: #ffffff;
            padding: 30px 36px;
            font-size: 13px;
            line-height: 1.5;
          }
          @media print {
            body { padding: 10px; font-size: 12px; }
            .no-print { display: none !important; }
            @page { margin: 1cm; size: A4 portrait; }
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #F5A623;
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          .brand-title {
            font-family: 'Cinzel', serif;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 2px;
            color: #153f3f;
          }
          .brand-subtitle {
            font-size: 11px;
            color: #d97706;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            margin-top: 2px;
          }
          .report-badge {
            text-align: ${isAr ? 'left' : 'right'};
          }
          .report-title {
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
          }
          .report-meta {
            font-size: 11px;
            color: #64748b;
            margin-top: 3px;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 12px;
            margin-bottom: 20px;
          }
          .kpi-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 16px;
          }
          .kpi-box.total {
            background: #fff1f2;
            border-color: #fecdd3;
          }
          .kpi-label {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 700;
            color: #64748b;
            letter-spacing: 0.5px;
          }
          .kpi-box.total .kpi-label {
            color: #be123c;
          }
          .kpi-value {
            font-size: 20px;
            font-weight: 900;
            color: #0f172a;
            margin-top: 3px;
          }
          .kpi-box.total .kpi-value {
            color: #b91c1c;
          }
          .categories-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            background: #153f3f;
            color: #ffffff;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 12px;
            text-align: ${isAr ? 'right' : 'left'};
          }
          td {
            padding: 9px 12px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background: #fafaf9;
          }
          .footer-total-row {
            background: #f8fafc;
            border-top: 2px solid #cbd5e1;
            font-weight: 900;
          }
          .footer-note {
            margin-top: 28px;
            padding-top: 14px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #94a3b8;
          }
          .action-bar {
            position: fixed;
            bottom: 20px;
            ${isAr ? 'left: 20px;' : 'right: 20px;'}
            background: #153f3f;
            color: white;
            padding: 10px 20px;
            border-radius: 50px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            display: flex;
            gap: 12px;
            align-items: center;
            z-index: 100;
          }
          .action-btn {
            background: #F5A623;
            color: #1a1510;
            border: none;
            padding: 8px 16px;
            font-weight: 700;
            border-radius: 30px;
            cursor: pointer;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="action-bar no-print">
          <span>${isAr ? 'معاينة التقرير جاهزة للطباعة / الحفظ كـ PDF' : 'Ready to Print or Save as PDF'}</span>
          <button class="action-btn" onclick="window.print()">${isAr ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</button>
        </div>

        <div class="header">
          <div>
            <div class="brand-title">GNOUBY</div>
            <div class="brand-subtitle">Luxury Nubian Fragrances</div>
          </div>
          <div class="report-badge">
            <div class="report-title">${isAr ? 'تقرير المصروفات والنفقات' : 'Expenses & Outlay Report'}</div>
            <div class="report-meta">${isAr ? 'تاريخ التقرير:' : 'Generated:'} ${dateStr}</div>
            <div class="report-meta">${isAr ? 'الأدمن:' : 'Admin:'} ${this.auth.currentUser()?.email || 'admin@gnouby.local'}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box total">
            <div class="kpi-label">${isAr ? 'إجمالي المصروفات' : 'Total Outlay'}</div>
            <div class="kpi-value">${total.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${isAr ? 'عدد العمليات' : 'Records Count'}</div>
            <div class="kpi-value">${list.length}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">${isAr ? 'أعلى تصنيف' : 'Top Category'}</div>
            <div class="kpi-value" style="font-size: 15px;">${this.getCategoryLabel(this.topCategory().name)}</div>
          </div>
        </div>

        <div class="categories-strip">
          ${categoriesChipsHtml}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th>${isAr ? 'بيان المصروف' : 'Title & Description'}</th>
              <th style="width: 120px;">${isAr ? 'التصنيف' : 'Category'}</th>
              <th style="width: 100px;">${isAr ? 'التاريخ' : 'Date'}</th>
              <th style="width: 130px; text-align: right;">${isAr ? 'المبلغ' : 'Amount'}</th>
              <th style="width: 75px; text-align: center;">${isAr ? 'الإيصال' : 'Receipt'}</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="footer-total-row">
              <td colspan="4" style="text-align: ${isAr ? 'left' : 'right'}; font-weight: 800; font-size: 13px;">
                ${isAr ? 'الإجمالي الكلي:' : 'Total Outlay:'}
              </td>
              <td style="text-align: right; font-weight: 900; font-size: 14px; color: #b91c1c;">
                ${total.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div class="footer-note">
          <div>GNOUBY Perfumes &bull; Official Financial Management Statement</div>
          <div>${isAr ? 'تم الاستخراج إلكترونياً من لوحة التحكم' : 'Generated electronically via Admin Panel'}</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 350);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    this.toast.show(isAr ? 'تم فتح تقرير الـ PDF بنجاح' : 'Expenses PDF generated successfully', 'success');
  }

  getCategoryMeta(cat: string): CategoryMeta {
    return this.categoriesMeta[cat] || this.categoriesMeta['Other'];
  }

  getCategoryLabel(cat: string): string {
    const key = `cat_${cat}`;
    const translated = this.i18n.t(key);
    return translated === key ? cat : translated;
  }

  formatEgp(value: number): string {
    return `${value.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  }
}
