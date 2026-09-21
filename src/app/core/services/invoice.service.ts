import { Injectable } from '@angular/core';
import { Order } from '@core/models/store.models';
import { LocalizationService } from '@core/services/localization.service';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  constructor(private readonly i18n: LocalizationService) {}

  /**
   * Generates and downloads/prints a luxury PDF invoice for a customer's order.
   */
  downloadInvoice(order: Order, customerInfo?: { fullName?: string; email?: string; phone?: string } | null): void {
    const isAr = this.i18n.language() === 'ar';
    const printWindow = window.open('', '_blank', 'width=950,height=900');
    if (!printWindow) {
      alert(isAr ? 'يرجى السماح بالنوافذ المنبثقة (Popups) لتحميل الفاتورة.' : 'Please allow popups to download your invoice.');
      return;
    }

    const orderDate = order.date ? new Date(order.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '—';

    const customerName = customerInfo?.fullName || order.shippingAddress?.name || 'Customer';
    const customerEmail = customerInfo?.email || order.userEmail || '';
    const customerPhone = customerInfo?.phone || order.shippingAddress?.phone || '';
    const address = order.shippingAddress
      ? `${order.shippingAddress.street || ''}, ${order.shippingAddress.city || ''} ${order.shippingAddress.zip || ''}`.trim()
      : 'N/A';

    const formatEgp = (amount: number) => {
      return `${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} EGP`;
    };

    const paymentMethodLabel = this.getPaymentMethodLabel(order.paymentMethod, isAr);
    const paymentStatusBadge = this.getPaymentStatusBadge(order.paymentStatus, isAr);

    const itemsRowsHtml = (order.items || []).map((item, idx) => `
      <tr>
        <td style="text-align: center; color: #78716c; font-size: 11px; width: 35px;">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid #e7e5e4;" onerror="this.style.display='none'">` : ''}
            <div>
              <div style="font-weight: 700; color: #153f3f; font-size: 13px;">${item.name}</div>
              <div style="font-size: 11px; color: #78716c;">SKU: GNB-${item.id}</div>
            </div>
          </div>
        </td>
        <td style="text-align: center; font-weight: 600; font-size: 12px; color: #44403c;">${item.quantity}</td>
        <td style="text-align: ${isAr ? 'left' : 'right'}; font-weight: 600; font-size: 12px; color: #44403c;">${formatEgp(item.price)}</td>
        <td style="text-align: ${isAr ? 'left' : 'right'}; font-weight: 800; font-size: 13px; color: #153f3f;">${formatEgp(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
      <head>
        <meta charset="utf-8">
        <title>${isAr ? 'فاتورة طلب' : 'Invoice'} #${order.id} - GNOUBY</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Cairo:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: ${isAr ? "'Cairo', sans-serif" : "'Inter', sans-serif"};
            color: #1c1917;
            background: #fdfbf7;
            padding: 36px 40px;
            font-size: 13px;
            line-height: 1.5;
          }
          @media print {
            body { padding: 0; background: #fff; font-size: 12px; }
            .no-print { display: none !important; }
            @page { margin: 12mm 15mm; size: A4 portrait; }
            .invoice-card { border: none !important; box-shadow: none !important; }
          }
          .invoice-card {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e7e5e4;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            overflow: hidden;
          }
          .invoice-header-bg {
            background: linear-gradient(135deg, #153f3f 0%, #1a4f4f 60%, #205c5c 100%);
            color: #ffffff;
            padding: 32px 36px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #F5A623;
          }
          .brand-logo {
            font-family: 'Cinzel', serif;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 3px;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .brand-gold { color: #F5A623; }
          .brand-tagline {
            font-size: 11px;
            color: #e2e8f0;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 4px;
            font-weight: 500;
          }
          .invoice-badge-block {
            text-align: ${isAr ? 'left' : 'right'};
          }
          .invoice-title {
            font-family: ${isAr ? "'Cairo', sans-serif" : "'Cinzel', serif"};
            font-size: 20px;
            font-weight: 800;
            letter-spacing: 1px;
            color: #F5A623;
          }
          .invoice-meta-item {
            font-size: 12px;
            color: #e2e8f0;
            margin-top: 3px;
          }
          .invoice-content {
            padding: 32px 36px;
          }
          .info-cards-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 28px;
          }
          .info-box {
            background: #fafaf9;
            border: 1px solid #f5f5f4;
            border-radius: 12px;
            padding: 16px 20px;
          }
          .info-box-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #78716c;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .info-box-name {
            font-size: 14px;
            font-weight: 700;
            color: #153f3f;
            margin-bottom: 4px;
          }
          .info-box-text {
            font-size: 12px;
            color: #57534e;
            line-height: 1.4;
          }
          .status-pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            margin-top: 6px;
          }
          .pill-paid { background: #dcfce7; color: #166534; }
          .pill-pending { background: #fef3c7; color: #92400e; }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          .items-table th {
            background: #153f3f;
            color: #ffffff;
            padding: 10px 14px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: ${isAr ? 'right' : 'left'};
          }
          .items-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #f5f5f4;
            vertical-align: middle;
          }
          .items-table tr:last-child td { border-bottom: 2px solid #e7e5e4; }
          .totals-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
            margin-bottom: 30px;
          }
          .payment-summary-box {
            flex: 1;
            background: #fafaf9;
            border: 1px solid #e7e5e4;
            border-radius: 12px;
            padding: 16px 20px;
          }
          .totals-table-box {
            width: 320px;
            background: #fafaf9;
            border: 1px solid #e7e5e4;
            border-radius: 12px;
            padding: 16px 20px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
            color: #57534e;
          }
          .totals-row.discount {
            color: #16a34a;
            font-weight: 600;
          }
          .totals-row.grand-total {
            border-top: 2px dashed #d6d3d1;
            margin-top: 8px;
            padding-top: 10px;
            font-size: 16px;
            font-weight: 800;
            color: #153f3f;
          }
          .totals-row.grand-total span:last-child {
            color: #b45309;
            font-size: 18px;
          }
          .invoice-footer {
            border-top: 1px solid #e7e5e4;
            padding-top: 20px;
            text-align: center;
            color: #78716c;
            font-size: 11px;
            line-height: 1.6;
          }
          .thank-you {
            font-family: ${isAr ? "'Cairo', sans-serif" : "'Cinzel', serif"};
            font-size: 14px;
            font-weight: 700;
            color: #153f3f;
            margin-bottom: 6px;
          }
          .action-bar {
            position: fixed;
            bottom: 24px;
            ${isAr ? 'left: 24px;' : 'right: 24px;'};
            background: #153f3f;
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            box-shadow: 0 12px 30px rgba(0,0,0,0.3);
            display: flex;
            gap: 16px;
            align-items: center;
            z-index: 999;
          }
          .action-btn {
            background: #F5A623;
            color: #1c1917;
            border: none;
            padding: 9px 20px;
            font-weight: 800;
            border-radius: 30px;
            cursor: pointer;
            font-size: 13px;
            transition: transform 0.2s, background 0.2s;
            font-family: inherit;
          }
          .action-btn:hover {
            background: #e09618;
            transform: translateY(-1px);
          }
        </style>
      </head>
      <body>
        <div class="action-bar no-print">
          <span style="font-size: 13px; font-weight: 600;">
            ${isAr ? 'الفاتورة جاهزة للطباعة أو الحفظ كـ PDF' : 'Invoice ready to print or save as PDF'}
          </span>
          <button class="action-btn" onclick="window.print()">
            ${isAr ? '🖨️ طباعة / حفظ كـ PDF' : '🖨️ Print / Save PDF'}
          </button>
        </div>

        <div class="invoice-card">
          <div class="invoice-header-bg">
            <div>
              <div class="brand-logo">GNOUBY <span class="brand-gold">✦</span></div>
              <div class="brand-tagline">${isAr ? 'عطور نوبية فاخرة' : 'Luxury Nubian Fragrances'}</div>
              <div style="font-size: 11px; color: #cbd5e1; margin-top: 6px;">
                Cairo, Egypt · support@gnouby.com · www.gnouby.com
              </div>
            </div>
            <div class="invoice-badge-block">
              <div class="invoice-title">${isAr ? 'فاتورة ضريبية' : 'TAX INVOICE'}</div>
              <div class="invoice-meta-item"><strong>${isAr ? 'رقم الطلب:' : 'Order #:'}</strong> ${order.id}</div>
              <div class="invoice-meta-item"><strong>${isAr ? 'تاريخ الطلب:' : 'Date:'}</strong> ${orderDate}</div>
              <div class="invoice-meta-item"><strong>${isAr ? 'الحالة:' : 'Status:'}</strong> ${this.getOrderStatusLabel(order.status, isAr)}</div>
            </div>
          </div>

          <div class="invoice-content">
            <div class="info-cards-grid">
              <div class="info-box">
                <div class="info-box-title">
                  <span>${isAr ? '👤 فاتورة إلى (العميل)' : '👤 Billed To'}</span>
                </div>
                <div class="info-box-name">${customerName}</div>
                ${customerEmail ? `<div class="info-box-text">${customerEmail}</div>` : ''}
                ${customerPhone ? `<div class="info-box-text">${customerPhone}</div>` : ''}
              </div>

              <div class="info-box">
                <div class="info-box-title">
                  <span>${isAr ? '📍 تفاصيل الشحن والتوصيل' : '📍 Shipping Address'}</span>
                </div>
                <div class="info-box-name">${order.shippingAddress?.city || 'Egypt'}</div>
                <div class="info-box-text">${address}</div>
                ${order.courierName ? `<div class="info-box-text" style="margin-top: 4px;"><strong>${isAr ? 'شركة الشحن:' : 'Courier:'}</strong> ${order.courierName}</div>` : ''}
                ${order.trackingNumber ? `<div class="info-box-text"><strong>${isAr ? 'رقم التتبع:' : 'Tracking #:'}</strong> ${order.trackingNumber}</div>` : ''}
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 35px; text-align: center;">#</th>
                  <th>${isAr ? 'المنتج' : 'Item Description'}</th>
                  <th style="text-align: center; width: 60px;">${isAr ? 'الكمية' : 'Qty'}</th>
                  <th style="text-align: ${isAr ? 'left' : 'right'}; width: 110px;">${isAr ? 'السعر' : 'Unit Price'}</th>
                  <th style="text-align: ${isAr ? 'left' : 'right'}; width: 120px;">${isAr ? 'الإجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRowsHtml}
              </tbody>
            </table>

            <div class="totals-section">
              <div class="payment-summary-box">
                <div class="info-box-title">${isAr ? '💳 بيانات الدفع' : '💳 Payment Details'}</div>
                <div style="margin-top: 6px; font-size: 12px; color: #44403c;">
                  <div><strong>${isAr ? 'طريقة الدفع:' : 'Method:'}</strong> ${paymentMethodLabel}</div>
                  ${order.paymentReference ? `<div style="margin-top: 3px;"><strong>${isAr ? 'المرجع:' : 'Reference:'}</strong> ${order.paymentReference}</div>` : ''}
                  ${order.deliveryZoneName ? `<div style="margin-top: 3px;"><strong>${isAr ? 'منطقة التوصيل:' : 'Delivery zone:'}</strong> ${order.deliveryZoneName}${order.deliveryAreaName ? ` / ${order.deliveryAreaName}` : ''}</div>` : ''}
                  <div style="margin-top: 3px;"><strong>${isAr ? 'مدفوع أونلاين:' : 'Paid online:'}</strong> ${formatEgp(order.onlinePaymentAmount || 0)}</div>
                  <div style="margin-top: 3px;"><strong>${isAr ? 'مستحق عند التوصيل:' : 'Due at delivery:'}</strong> ${formatEgp(this.dueAtDelivery(order))}</div>
                  <div style="margin-top: 6px;">
                    <span class="status-pill ${order.paymentStatus === 'paid' ? 'pill-paid' : order.paymentStatus === 'partiallyPaid' ? 'pill-pending' : 'pill-pending'}">
                      ${paymentStatusBadge}
                    </span>
                  </div>
                </div>
              </div>

              <div class="totals-table-box">
                <div class="totals-row">
                  <span>${isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <strong>${formatEgp(order.subtotal)}</strong>
                </div>
                ${order.discount > 0 ? `
                  <div class="totals-row discount">
                    <span>${isAr ? 'الخصم' : 'Discount'} ${order.promoCode ? `(${order.promoCode})` : ''}</span>
                    <strong>-${formatEgp(order.discount)}</strong>
                  </div>
                ` : ''}
                <div class="totals-row">
                  <span>${isAr ? 'مصاريف الشحن' : 'Shipping Fee'}</span>
                  <strong>${(order.shippingFee || 0) > 0 ? formatEgp(order.shippingFee!) : (isAr ? 'مجاناً' : 'Free')}</strong>
                </div>
                <div class="totals-row grand-total">
                  <span>${isAr ? 'المجموع الكلي' : 'Grand Total'}</span>
                  <span>${formatEgp(order.total)}</span>
                </div>
              </div>
            </div>

            <div class="invoice-footer">
              <div class="thank-you">
                ${isAr ? 'شكراً لاختياركم عطور جنوبي - تجربة عطرية نوبية أصيلة' : 'Thank you for shopping with GNOUBY - An Authentic Nubian Fragrance Journey'}
              </div>
              <p>${isAr ? 'لأي استفسارات أو دعم، يرجى التواصل عبر البريد support@gnouby.com' : 'For any inquiries or customer support, please contact us at support@gnouby.com'}</p>
              <p style="margin-top: 4px; font-size: 10px; color: #a8a29e;">
                ${isAr ? 'هذه الفاتورة تم إنشاؤها إلكترونياً وتعتبر مستند شراء رسمي.' : 'This is an electronically generated invoice and serves as an official proof of purchase.'}
              </p>
            </div>
          </div>
        </div>

        <script>
          setTimeout(function() {
            window.print();
          }, 350);
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  private dueAtDelivery(order: Order): number {
    if (order.paymentStatus === 'paid') return 0;
    if (typeof order.amountDueAtDelivery === 'number') return order.amountDueAtDelivery;
    if (order.paymentMethod === 'cashOnDelivery') return order.total;
    return order.shippingFee || 0;
  }

  private getPaymentMethodLabel(method?: string, isAr = false): string {
    switch (method) {
      case 'wallet':
        return isAr ? 'المحفظة الإلكترونية' : 'Digital Wallet';
      case 'card':
        return isAr ? 'بطاقة بنكية / فيزا' : 'Credit / Debit Card';
      case 'instapay':
        return isAr ? 'انستاباي (InstaPay)' : 'InstaPay';
      case 'cashOnDelivery':
      default:
        return isAr ? 'الدفع عند الاستلام (كاش)' : 'Cash on Delivery';
    }
  }

  private getPaymentStatusBadge(status?: string, isAr = false): string {
    switch (status) {
      case 'paid':
        return isAr ? '✓ مدفوع بالكامل' : '✓ Paid in Full';
      case 'partiallyPaid':
        return isAr ? 'مدفوع جزئياً — التوصيل عند الاستلام' : 'Partially paid — delivery on arrival';
      case 'failed':
        return isAr ? 'فشل الدفع' : 'Payment failed';
      case 'refunded':
        return isAr ? 'تم الاسترجاع' : 'Refunded';
      case 'pending':
      default:
        return isAr ? 'قيد التحصيل عند الاستلام' : 'Pending on Delivery';
    }
  }

  private getOrderStatusLabel(status: string, isAr = false): string {
    if (!isAr) return status;
    const map: Record<string, string> = {
      Pending: 'قيد المراجعة',
      Processing: 'قيد التجهيز',
      OnHold: 'معلق',
      Packed: 'تم التغليف',
      ReadyForPickup: 'جاهز للاستلام',
      Shipped: 'تم الشحن',
      OutForDelivery: 'خرج للتوصيل',
      Delivered: 'تم التوصيل',
      Cancelled: 'ملغي'
    };
    return map[status] || status;
  }
}
