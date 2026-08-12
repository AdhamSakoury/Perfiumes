namespace Perfiumes.Api.Models;

public sealed record OrderItemDto(int Id, string Name, decimal Price, string Image, int Quantity);

public sealed record ShippingAddressDto(string Name, string Street, string City, string State, string Zip, string Country);

public sealed record OrderTrackingEventDto(string Id, string Status, string Title, string Description, DateTimeOffset CreatedAt);

public sealed record OrderDto(
    string Id,
    DateTimeOffset Date,
    string Status,
    IReadOnlyList<OrderItemDto> Items,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    ShippingAddressDto ShippingAddress,
    string? PromoCode,
    IReadOnlyList<OrderTrackingEventDto> TrackingEvents);

public sealed record CreateOrderRequest(
    string UserEmail,
    IReadOnlyList<OrderItemDto> Items,
    decimal Subtotal,
    decimal Discount,
    decimal Total,
    ShippingAddressDto ShippingAddress,
    string? PromoCode);

public sealed record UpdateOrderStatusRequest(string Status, string? Note);
