import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DeliveryZone, UpsertDeliveryZone } from '@core/models/store.models';
import { AuthService } from '@core/services/auth.service';
import { DeliveryZoneService } from '@core/services/delivery-zone.service';
import { LocalizationService } from '@core/services/localization.service';
import { ToastService } from '@core/services/toast.service';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import { EgpPipe } from '@shared/pipes/egp.pipe';
import { Observable, catchError, finalize, switchMap, throwError, timeout } from 'rxjs';

type ZoneForm = {
  name: string;
  cityRegion: string;
  pricingType: 'fixed' | 'range' | 'distance';
  minFee: number;
  maxFee: number;
  fixedFee: number;
  defaultFee: number;
  estimatedDays: number;
  sortOrder: number;
  isActive: boolean;
  areas: Array<{ id?: string; name: string; fee: number; sortOrder: number; isActive: boolean }>;
};

@Component({
  selector: 'app-admin-delivery-zones',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe, EgpPipe],
  templateUrl: './admin-delivery-zones.component.html',
  styleUrl: './admin-delivery-zones.component.css'
})
export class AdminDeliveryZonesComponent {
  zones: DeliveryZone[] = [];
  editingId: string | null = null;
  form: ZoneForm = this.emptyForm();
  loading = false;
  saving = false;
  deletingId = '';
  loadError = '';

  // Filter & Search
  searchTerm = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';

  constructor(
    readonly auth: AuthService,
    private readonly zoneService: DeliveryZoneService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly i18n: LocalizationService
  ) {
    if (!this.auth.currentUser()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/admin/delivery-zones' } });
      return;
    }
    this.load();
  }

  get isAdmin(): boolean {
    return this.auth.currentUser()?.role === 'admin';
  }

  // --- Statistics ---
  get totalZones(): number {
    return this.zones.length;
  }

  get activeZonesCount(): number {
    return this.zones.filter((z) => z.isActive).length;
  }

  get inactiveZonesCount(): number {
    return this.zones.filter((z) => !z.isActive).length;
  }

  get totalAreasCount(): number {
    return this.zones.reduce((sum, z) => sum + (z.areas?.length || 0), 0);
  }

  // --- Filtered List ---
  get filteredZones(): DeliveryZone[] {
    return this.zones.filter((zone) => {
      // Status filter
      if (this.statusFilter === 'active' && !zone.isActive) return false;
      if (this.statusFilter === 'inactive' && zone.isActive) return false;

      // Search filter
      const term = this.searchTerm.trim().toLowerCase();
      if (!term) return true;

      const matchName = zone.name.toLowerCase().includes(term);
      const matchCity = zone.cityRegion.toLowerCase().includes(term);
      const matchType = zone.pricingType.toLowerCase().includes(term);
      const matchArea = zone.areas?.some((a) => a.name.toLowerCase().includes(term));

      return matchName || matchCity || matchType || matchArea;
    });
  }

  load(): void {
    if (!this.isAdmin) return;
    this.loading = true;
    this.loadError = '';
    this.fetchWithAuth((token) => this.zoneService.getAdminZones(token)).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; })
    ).subscribe({
      next: (zones) => { this.zones = zones; },
      error: (err: unknown) => {
        this.loadError = err instanceof HttpErrorResponse
          ? err.error?.message || this.i18n.t('deliveryZonesLoadFailed')
          : this.i18n.t('deliveryZonesLoadFailed');
        this.toast.show(this.loadError, 'error');
      }
    });
  }

  startCreate(): void {
    this.editingId = null;
    this.form = this.emptyForm();
  }

  startEdit(zone: DeliveryZone): void {
    this.editingId = zone.id;
    this.form = {
      name: zone.name,
      cityRegion: zone.cityRegion,
      pricingType: (zone.pricingType === 'range' || zone.pricingType === 'distance' ? zone.pricingType : 'fixed'),
      minFee: zone.minFee,
      maxFee: zone.maxFee,
      fixedFee: zone.fixedFee,
      defaultFee: zone.defaultFee,
      estimatedDays: zone.estimatedDays,
      sortOrder: zone.sortOrder,
      isActive: zone.isActive,
      areas: (zone.areas || []).map((area) => ({
        id: area.id,
        name: area.name,
        fee: area.fee,
        sortOrder: area.sortOrder,
        isActive: area.isActive
      }))
    };

    // Smooth scroll to form on mobile/smaller screens
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  }

  addArea(): void {
    this.form.areas.push({
      name: '',
      fee: this.form.pricingType === 'fixed' ? this.form.fixedFee : this.form.minFee,
      sortOrder: this.form.areas.length + 1,
      isActive: true
    });
  }

  removeArea(index: number): void {
    this.form.areas.splice(index, 1);
  }

  save(): void {
    if (!this.isAdmin || this.saving) return;
    const payload = this.toPayload();
    if (!payload.name.trim() || !payload.cityRegion.trim()) {
      this.toast.show(this.i18n.t('deliveryZoneValidation'), 'error');
      return;
    }

    this.saving = true;
    const request = this.editingId
      ? (token: string) => this.zoneService.update(this.editingId!, payload, token)
      : (token: string) => this.zoneService.create(payload, token);

    this.fetchWithAuth(request).pipe(
      timeout(15000),
      finalize(() => { this.saving = false; })
    ).subscribe({
      next: () => {
        this.toast.show(this.editingId ? this.i18n.t('deliveryZoneUpdated') : this.i18n.t('deliveryZoneCreated'), 'success');
        this.startCreate();
        this.load();
      },
      error: (error: unknown) => {
        const msg = error instanceof HttpErrorResponse ? error.error?.message : undefined;
        this.toast.show(msg || this.i18n.t('deliveryZoneSaveFailed'), 'error');
      }
    });
  }

  toggleActive(zone: DeliveryZone, event?: Event): void {
    if (event) event.stopPropagation();
    if (!this.isAdmin || this.saving) return;

    const updatedPayload: UpsertDeliveryZone = {
      name: zone.name,
      cityRegion: zone.cityRegion,
      pricingType: zone.pricingType,
      minFee: zone.minFee,
      maxFee: zone.maxFee,
      fixedFee: zone.fixedFee,
      defaultFee: zone.defaultFee,
      estimatedDays: zone.estimatedDays,
      sortOrder: zone.sortOrder,
      isActive: !zone.isActive,
      areas: (zone.areas || []).map((a, i) => ({
        id: a.id,
        name: a.name,
        fee: a.fee,
        sortOrder: a.sortOrder || i + 1,
        isActive: a.isActive
      }))
    };

    this.fetchWithAuth((token) => this.zoneService.update(zone.id, updatedPayload, token)).subscribe({
      next: () => {
        zone.isActive = !zone.isActive;
        this.toast.show(zone.isActive ? 'Zone activated' : 'Zone deactivated', 'success');
      },
      error: () => {
        this.toast.show('Failed to update zone status', 'error');
      }
    });
  }

  remove(zone: DeliveryZone): void {
    if (!this.isAdmin || this.deletingId) return;
    if (!confirm(`Are you sure you want to delete the delivery zone "${zone.name}"?`)) return;

    this.deletingId = zone.id;
    this.fetchWithAuth((token) => this.zoneService.delete(zone.id, token)).pipe(
      finalize(() => { this.deletingId = ''; })
    ).subscribe({
      next: () => {
        this.toast.show(this.i18n.t('deliveryZoneDeleted'), 'success');
        if (this.editingId === zone.id) this.startCreate();
        this.load();
      },
      error: (error: unknown) => {
        const msg = error instanceof HttpErrorResponse ? error.error?.message : undefined;
        this.toast.show(msg || this.i18n.t('deliveryZoneDeleteFailed'), 'error');
      }
    });
  }

  feeLabel(zone: DeliveryZone): string {
    if (zone.pricingType === 'fixed') return `${zone.fixedFee || zone.defaultFee}`;
    return `${zone.minFee} – ${zone.maxFee}`;
  }

  private toPayload(): UpsertDeliveryZone {
    return {
      name: this.form.name.trim(),
      cityRegion: this.form.cityRegion.trim(),
      pricingType: this.form.pricingType,
      minFee: Number(this.form.minFee) || 0,
      maxFee: Number(this.form.maxFee) || 0,
      fixedFee: Number(this.form.fixedFee) || 0,
      defaultFee: Number(this.form.defaultFee) || 0,
      estimatedDays: Number(this.form.estimatedDays) || 3,
      sortOrder: Number(this.form.sortOrder) || 0,
      isActive: this.form.isActive,
      areas: this.form.areas
        .filter((area) => area.name.trim())
        .map((area, index) => ({
          id: area.id,
          name: area.name.trim(),
          fee: Number(area.fee) || 0,
          sortOrder: area.sortOrder || index + 1,
          isActive: area.isActive
        }))
    };
  }

  private emptyForm(): ZoneForm {
    return {
      name: '',
      cityRegion: '',
      pricingType: 'range',
      minFee: 40,
      maxFee: 50,
      fixedFee: 0,
      defaultFee: 45,
      estimatedDays: 3,
      sortOrder: this.zones.length + 1,
      isActive: true,
      areas: []
    };
  }

  private fetchWithAuth<T>(requestFn: (token: string) => Observable<T>): Observable<T> {
    return this.auth.ensureAccessToken().pipe(
      switchMap((token) => {
        if (!token) return throwError(() => new Error('No admin token'));
        return requestFn(token);
      }),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          return this.auth.ensureAccessToken(true).pipe(
            switchMap((refreshedToken) => {
              if (!refreshedToken) return throwError(() => error);
              return requestFn(refreshedToken);
            })
          );
        }
        return throwError(() => error);
      })
    );
  }
}
