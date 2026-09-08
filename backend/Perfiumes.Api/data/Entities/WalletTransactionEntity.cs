namespace Perfiumes.Api.Data.Entities;

public sealed class WalletTransactionEntity
{
    public string Id { get; set; } = string.Empty;
    public string WalletId { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Type { get; set; } = "credit";
    public string ActorRole { get; set; } = "system";
    public string Reason { get; set; } = string.Empty;
    public string? ReferenceId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public UserWalletEntity? Wallet { get; set; }
}
