namespace Perfiumes.Api.Models;

public sealed record AdminDashboardSummaryDto(
    int TotalUsers,
    int TotalCustomers,
    int TotalProducts,
    int TotalOrders,
    int OpenSupportMessages,
    decimal Revenue,
    decimal WalletBalance,
    IReadOnlyList<AdminDashboardOrderDto> RecentOrders,
    IReadOnlyList<AdminWalletDto> Wallets);

public sealed record AdminDashboardOrderDto(
    string Id,
    string UserEmail,
    string Status,
    decimal Total,
    DateTimeOffset Date);

public sealed record AdminWalletDto(
    string Id,
    string UserId,
    string UserName,
    string UserEmail,
    decimal Balance,
    decimal LifetimeCredit,
    decimal LifetimeDebit,
    string Currency,
    DateTimeOffset UpdatedAt);

public sealed record AdjustWalletRequest(decimal Amount, string Type, string Reason, string? ReferenceId);

public sealed record TopUpWalletRequest(decimal Amount, string? Reason);

public sealed record WalletTransactionDto(
    string Id,
    decimal Amount,
    string Type,
    string Reason,
    string? ReferenceId,
    DateTimeOffset CreatedAt);

public sealed record UserWalletDto(
    string Id,
    decimal Balance,
    decimal LifetimeCredit,
    decimal LifetimeDebit,
    string Currency,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<WalletTransactionDto> Transactions);
