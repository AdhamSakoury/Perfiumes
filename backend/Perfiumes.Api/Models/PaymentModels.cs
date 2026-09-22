namespace Perfiumes.Api.Models;

public sealed record PaymobCheckoutRequest(string OrderId);

public sealed record PaymobCheckoutResponse(
    string OrderId,
    string ClientSecret,
    string CheckoutUrl,
    string? IntentionId = null,
    string? IntentionOrderId = null);

public sealed record PaymentGatewayAvailability(bool Configured, string? Message);

public sealed record WalletTopUpApiRequest(decimal Amount);

public sealed record WalletTopUpResponse(string TopUpId, decimal Amount, string Currency, string ClientSecret, string CheckoutUrl);

public sealed record WalletTopUpConfirmRequest(
    string? TransactionId,
    string? TopUpId = null,
    bool? Success = null,
    long? AmountCents = null,
    string? MerchantOrderId = null,
    string? PaymobOrderId = null,
    bool? Pending = null);

public sealed record WalletTopUpConfirmResult(string Status, string Kind, UserWalletDto? Wallet);

public sealed record WalletTopUpStatusDto(
    string Id,
    decimal Amount,
    string Currency,
    string Status,
    string PaymentProvider,
    string? ProviderTransactionId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

public sealed record PaymobTransactionVerificationResult(
    bool Success,
    bool Pending,
    string? TransactionId,
    string? SpecialReference,
    decimal Amount,
    string? Error);
