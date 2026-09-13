namespace Perfiumes.Api.Models;

public sealed record OrderItemDto(int Id, string Name, decimal Price, string Image, int Quantity);

public sealed record ShippingAddressDto(
    string Name,
    string Street,
    string City,
    string State,
    string Zip,
    string Country,
    string Phone = "",
    double? Latitude = null,
    double? Longitude = null);

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
    string? DeliveryPhone,
    double? CustomerLatitude,
    double? CustomerLongitude,
    double? DeliveryLatitude,
    double? DeliveryLongitude,
    DateTimeOffset? DeliveryLocationUpdatedAt,
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

public sealed record UpdateLocationRequest(double Latitude, double Longitude);

public sealed record OrderMessageDto(
    string Id,
    string OrderId,
    string SenderRole,
    string SenderName,
    string SenderEmail,
    string Message,
    DateTimeOffset CreatedAt);

public sealed record SendOrderMessageRequest(string Message);

public sealed record ProductReviewDto(
    string Id,
    int ProductId,
    string OrderId,
    string UserEmail,
    string UserName,
    int Rating,
    string Comment,
    DateTimeOffset CreatedAt);

public sealed record CreateProductReviewRequest(
    int ProductId,
    int Rating,
    string? Comment);

public sealed record DeliveryRatingDto(
    string Id,
    string OrderId,
    string DeliveryUserId,
    string UserEmail,
    string UserName,
    int Rating,
    string Comment,
    DateTimeOffset CreatedAt);

public sealed record CreateDeliveryRatingRequest(
    int Rating,
    string? Comment);

public sealed record OrderRatingsStatusDto(
    bool HasRatedDelivery,
    int? DeliveryRating,
    string? DeliveryComment,
    IReadOnlyList<ProductReviewDto> ProductReviews);
