import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Order } from '@core/models/store.models';
import { OrderTrackingService } from '@core/services/order-tracking.service';
import { Subscription } from 'rxjs';

declare const L: any;

@Component({
  selector: 'app-order-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-map.component.html',
  styleUrl: './order-map.component.css'
})
export class OrderMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) order!: Order;
  @Input() isDeliveryView = false;
  @Output() locationUpdated = new EventEmitter<{ latitude: number; longitude: number }>();

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: any = null;
  private customerMarker: any = null;
  private deliveryMarker: any = null;
  private routeLine: any = null;
  private locationSub?: Subscription;
  private watchId: number | null = null;
  private simulationTimer: any = null;

  distanceKm: number | null = null;
  estimatedMinutes: number | null = null;
  isWatching = false;
  isSimulating = false;
  gpsError = '';

  currentDeliveryLat: number | null = null;
  currentDeliveryLng: number | null = null;

  constructor(private readonly trackingService: OrderTrackingService) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initMap();
    }, 150);

    this.trackingService.joinOrder(this.order.id);
    this.locationSub = this.trackingService.location$.subscribe((event) => {
      if (event.orderId.toLowerCase() === this.order.id.toLowerCase()) {
        this.updateDeliveryPosition(event.latitude, event.longitude, false);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['order'] && this.map) {
      this.updateMarkers();
    }
  }

  ngOnDestroy(): void {
    this.stopWatching();
    this.stopSimulation();
    this.locationSub?.unsubscribe();
    this.trackingService.leaveOrder(this.order.id);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    if (!this.hasCustomerCoordinates() || !this.mapContainer || typeof L === 'undefined') return;

    const custLat = this.order.customerLatitude!;
    const custLng = this.order.customerLongitude!;
    const delLat = this.order.deliveryLatitude ?? (custLat - 0.015);
    const delLng = this.order.deliveryLongitude ?? (custLng - 0.012);

    this.currentDeliveryLat = delLat;
    this.currentDeliveryLng = delLng;

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([custLat, custLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.updateMarkers();
  }

  private updateMarkers(): void {
    if (!this.map || typeof L === 'undefined' || !this.hasCustomerCoordinates()) return;

    const custLat = this.order.customerLatitude!;
    const custLng = this.order.customerLongitude!;
    const delLat = this.currentDeliveryLat ?? this.order.deliveryLatitude ?? (custLat - 0.015);
    const delLng = this.currentDeliveryLng ?? this.order.deliveryLongitude ?? (custLng - 0.012);

    // Customer Icon
    const customerIcon = L.divIcon({
      className: 'custom-map-icon customer-pin',
      html: `
        <div class="pin-bubble pin-customer">
          <i class="fas fa-house-chimney"></i>
        </div>
        <div class="pin-pulse pin-pulse-customer"></div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 36]
    });

    // Delivery Courier Icon
    const deliveryIcon = L.divIcon({
      className: 'custom-map-icon delivery-pin',
      html: `
        <div class="pin-bubble pin-delivery">
          <i class="fas fa-motorcycle"></i>
        </div>
        <div class="pin-pulse pin-pulse-delivery"></div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 40]
    });

    if (this.customerMarker) {
      this.customerMarker.setLatLng([custLat, custLng]);
    } else {
      this.customerMarker = L.marker([custLat, custLng], { icon: customerIcon })
        .addTo(this.map)
        .bindPopup(`
          <div class="p-1 text-xs">
            <strong class="text-sm block font-bold text-gray-900">${this.order.shippingAddress.name}</strong>
            <span class="text-gray-600">${this.order.shippingAddress.street}, ${this.order.shippingAddress.city}</span>
          </div>
        `);
    }

    if (this.deliveryMarker) {
      this.deliveryMarker.setLatLng([delLat, delLng]);
    } else {
      this.deliveryMarker = L.marker([delLat, delLng], { icon: deliveryIcon })
        .addTo(this.map)
        .bindPopup(`
          <div class="p-1 text-xs">
            <strong class="text-sm block font-bold text-amber-700">${this.order.deliveryName || 'Delivery Courier'}</strong>
            <span class="text-gray-600">${this.order.status === 'Delivered' ? 'Delivered' : 'On the way to destination'}</span>
          </div>
        `);
    }

    // Polyline Route
    const latlngs = [
      [delLat, delLng],
      [custLat, custLng]
    ];

    if (this.routeLine) {
      this.routeLine.setLatLngs(latlngs);
    } else {
      this.routeLine = L.polyline(latlngs, {
        color: '#D4AF37',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 8'
      }).addTo(this.map);
    }

    // Fit bounds
    const bounds = L.latLngBounds([
      [delLat, delLng],
      [custLat, custLng]
    ]);
    this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });

    this.calculateDistance(delLat, delLng, custLat, custLng);
  }

  private updateDeliveryPosition(lat: number, lng: number, emit = true): void {
    this.currentDeliveryLat = lat;
    this.currentDeliveryLng = lng;

    if (this.deliveryMarker) {
      this.deliveryMarker.setLatLng([lat, lng]);
    }

    if (!this.hasCustomerCoordinates()) return;
    const custLat = this.order.customerLatitude!;
    const custLng = this.order.customerLongitude!;

    if (this.routeLine) {
      this.routeLine.setLatLngs([
        [lat, lng],
        [custLat, custLng]
      ]);
    }

    this.calculateDistance(lat, lng, custLat, custLng);

    if (emit) {
      this.locationUpdated.emit({ latitude: lat, longitude: lng });
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): void {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    this.distanceKm = Math.round(d * 10) / 10;
    // Estimate based on 25 km/h urban delivery speed in Egypt
    this.estimatedMinutes = Math.max(2, Math.round((d / 25) * 60));
  }

  useCurrentGPS(): void {
    this.gpsError = '';
    if (!navigator.geolocation) {
      this.gpsError = 'GPS is not supported by this device.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        this.updateDeliveryPosition(lat, lng, true);
        if (this.map) {
          this.map.panTo([lat, lng]);
        }
      },
      (error) => {
        console.warn('GPS error:', error);
        this.gpsError = error.code === error.PERMISSION_DENIED
          ? 'Location access was denied. Allow GPS access and try again.'
          : 'Could not obtain your current location. Please try again.';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  toggleLiveTracking(): void {
    if (this.isWatching) {
      this.stopWatching();
    } else {
      this.startWatching();
    }
  }

  private startWatching(): void {
    this.gpsError = '';
    if (!navigator.geolocation) {
      this.gpsError = 'GPS is not supported by this device.';
      return;
    }
    this.isWatching = true;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.updateDeliveryPosition(position.coords.latitude, position.coords.longitude, true);
      },
      (err) => {
        console.warn('Watch GPS error:', err);
        this.gpsError = 'Live GPS paused. Check location permission and retry.';
        this.stopWatching();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  }

  private stopWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isWatching = false;
  }

  toggleSimulation(): void {
    if (this.isSimulating) {
      this.stopSimulation();
    } else {
      this.startSimulation();
    }
  }

  private startSimulation(): void {
    if (!this.hasCustomerCoordinates()) return;
    const custLat = this.order.customerLatitude!;
    const custLng = this.order.customerLongitude!;
    let currentLat = this.currentDeliveryLat ?? (custLat - 0.015);
    let currentLng = this.currentDeliveryLng ?? (custLng - 0.012);

    this.isSimulating = true;
    const steps = 15;
    let stepCount = 0;
    const latStep = (custLat - currentLat) / steps;
    const lngStep = (custLng - currentLng) / steps;

    this.simulationTimer = setInterval(() => {
      stepCount++;
      currentLat += latStep;
      currentLng += lngStep;
      this.updateDeliveryPosition(currentLat, currentLng, true);

      if (stepCount >= steps) {
        this.stopSimulation();
      }
    }, 1800);
  }

  private stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    this.isSimulating = false;
  }

  hasCustomerCoordinates(): boolean {
    const { customerLatitude: latitude, customerLongitude: longitude } = this.order;
    return typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  get googleMapsUrl(): string | null {
    if (!this.hasCustomerCoordinates()) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${this.order.customerLatitude},${this.order.customerLongitude}`;
  }
}
