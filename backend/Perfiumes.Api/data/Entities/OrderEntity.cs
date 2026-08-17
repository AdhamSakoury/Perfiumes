namespace Perfiumes.Api.Data.Entities;

public sealed class OrderEntity
{
    public string Id { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public string Status { get; set; } = "Processing";
    public DateTimeOffset Date { get; set; }
    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal ShippingFee { get; set; }
    public decimal Total { get; set; }
    public string PaymentMethod { get; set; } = "cashOnDelivery";
    public string PaymentStatus { get; set; } = "pending";
    public string PaymentProvider { get; set; } = string.Empty;
    public string PaymentReference { get; set; } = string.Empty;
    public string CourierName { get; set; } = string.Empty;
    public string TrackingNumber { get; set; } = string.Empty;
    public DateTimeOffset? EstimatedDelivery { get; set; }
    public string ShippingName { get; set; } = string.Empty;
    public string ShippingPhone { get; set; } = string.Empty;
    public string ShippingStreet { get; set; } = string.Empty;
    public string ShippingCity { get; set; } = string.Empty;
    public string ShippingState { get; set; } = string.Empty;
    public string ShippingZip { get; set; } = string.Empty;
    public string ShippingCountry { get; set; } = string.Empty;
    public string? PromoCode { get; set; }
    public List<OrderItemEntity> Items { get; set; } = [];
    public List<OrderTrackingEventEntity> TrackingEvents { get; set; } = [];
}
