namespace Perfiumes.Api.Models;

public sealed record PaymobCheckoutRequest(string OrderId);

public sealed record PaymobCheckoutResponse(string OrderId, string ClientSecret, string CheckoutUrl);

public sealed record PaymentStatusUpdateRequest(string OrderId, string Status, string? Reference);
