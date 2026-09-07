namespace Perfiumes.Api.Models;

public sealed record PaymobCheckoutRequest(string OrderId);

public sealed record PaymobCheckoutResponse(string OrderId, string ClientSecret, string CheckoutUrl);

public sealed record PaymentGatewayAvailability(bool Configured, string? Message);
