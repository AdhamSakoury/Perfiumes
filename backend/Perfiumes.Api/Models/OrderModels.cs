namespace Perfiumes.Api.Models;

public sealed record OrderItemDto(int Id, string Name, decimal Price, string Image, int Quantity);

public sealed record ShippingAddressDto(string Name, string Street, string City, string State, string Zip, string Country, string Phone = "");

public sealed record OrderTrackingEventDto(string Id, string Status, string Title, string Description, DateTimeOffset CreatedAt);

public sealed record OrderDto(
    string Id,
    string UserEmail,
    DateTimeOffset Date,
    string Status,
    IReadOnlyList<OrderItemDto> Items,
    decimal Subtotal,
    decimal Discount,
    decimal ShippingFee,
    decimal Total,
    string PaymentMethod,
    string PaymentStatus,
    string PaymentProvider,
    string PaymentReference,
    string? DeliveryUserId,
    string? DeliveryName,
    string CourierName,
    string TrackingNumber,
    DateTimeOffset? EstimatedDelivery,
    ShippingAddressDto ShippingAddress,
    string? PromoCode,
    IReadOnlyList<OrderTrackingEventDto> TrackingEvents);

public sealed record CreateOrderRequest(
    string UserEmail,
    IReadOnlyList<OrderItemDto> Items,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    string? PaymentMethod,
    string? PaymentProvider,
    ShippingAddressDto ShippingAddress,
    string? PromoCode,
    string? ClientRequestId);

public sealed record UpdateOrderStatusRequest(string Status, string? Note);

public sealed record AssignDeliveryRequest(string DeliveryUserId);
