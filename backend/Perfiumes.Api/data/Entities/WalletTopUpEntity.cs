namespace Perfiumes.Api.Data.Entities;

public sealed class WalletTopUpEntity
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "EGP";
    public string Status { get; set; } = "pending"; // "pending", "paid", "failed"
    public string PaymentProvider { get; set; } = "Paymob";
    public string? ProviderTransactionId { get; set; }
    public string? ClientSecret { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
