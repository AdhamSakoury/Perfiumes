namespace Perfiumes.Api.Models;

public sealed record DeliveryZoneAreaDto(
    string Id,
    string Name,
    decimal Fee,
    int SortOrder,
    bool IsActive);

public sealed record DeliveryZoneDto(
    string Id,
    string Name,
    string CityRegion,
    decimal MinFee,
    decimal MaxFee,
    decimal FixedFee,
    decimal DefaultFee,
    string PricingType,
    int EstimatedDays,
    int SortOrder,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<DeliveryZoneAreaDto> Areas);

public sealed record DeliveryZoneAreaInput(string? Id, string Name, decimal Fee, int SortOrder = 0, bool IsActive = true);

public sealed record UpsertDeliveryZoneRequest(
    string Name,
    string CityRegion,
    string PricingType,
    decimal MinFee,
    decimal MaxFee,
    decimal FixedFee,
    decimal DefaultFee,
    int EstimatedDays = 3,
    int SortOrder = 0,
    bool IsActive = true,
    IReadOnlyList<DeliveryZoneAreaInput>? Areas = null);

public sealed record CheckoutQuoteRequest(
    IReadOnlyList<OrderItemDto> Items,
    string? PromoCode,
    string DeliveryZoneId,
    string? DeliveryAreaId,
    string? PaymentMethod);

public sealed record CheckoutQuoteDto(
    decimal Subtotal,
    decimal Discount,
    decimal ShippingFee,
    decimal Total,
    string PaymentMethod,
    decimal OnlinePaymentAmount,
    decimal AmountDueAtDelivery,
    string DeliveryZoneId,
    string DeliveryZoneName,
    string? DeliveryAreaId,
    string? DeliveryAreaName,
    int EstimatedDays);
