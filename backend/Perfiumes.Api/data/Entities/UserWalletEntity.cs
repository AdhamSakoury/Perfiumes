namespace Perfiumes.Api.Data.Entities;

public sealed class UserWalletEntity
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public decimal LifetimeCredit { get; set; }
    public decimal LifetimeDebit { get; set; }
    public string Currency { get; set; } = "EGP";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public AppUserEntity? User { get; set; }
    public List<WalletTransactionEntity> Transactions { get; set; } = [];
}
