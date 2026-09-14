namespace Perfiumes.Api.Models;

public sealed record AdminDashboardSummaryDto(
    int TotalUsers,
    int TotalCustomers,
    int TotalProducts,
    int TotalOrders,
    int OpenSupportMessages,
    decimal Revenue,
    decimal WalletBalance,
    decimal AverageOrderValue,
    int PendingOrders,
    int LowStockProducts,
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

public sealed record AdminWalletTransactionDto(
    string Id,
    string WalletId,
    string UserName,
    string UserEmail,
    decimal Amount,
    string Type,
    string Reason,
    string? ReferenceId,
    string Currency,
    DateTimeOffset CreatedAt);

public sealed record UserWalletDto(
    string Id,
    decimal Balance,
    decimal LifetimeCredit,
    decimal LifetimeDebit,
    string Currency,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<WalletTransactionDto> Transactions);

public sealed record ExpenseDto(
    string Id,
    string Title,
    string Category,
    decimal Amount,
    string? Description,
    DateTimeOffset Date,
    string CreatedByEmail,
    string? ReceiptUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateExpenseRequest(
    string Title,
    string Category,
    decimal Amount,
    string? Description,
    DateTimeOffset? Date,
    string? ReceiptUrl);

public sealed record UpdateExpenseRequest(
    string Title,
    string Category,
    decimal Amount,
    string? Description,
    DateTimeOffset? Date,
    string? ReceiptUrl);

public sealed record FinancialSummaryDto(
    decimal TotalRevenue,
    decimal TotalExpenses,
    decimal NetProfit,
    int TotalTransactions,
    decimal RevenueChangePercent,
    decimal ExpensesChangePercent,
    decimal NetProfitChangePercent);

public sealed record FinancialFlowPointDto(
    string Label,
    decimal Revenue,
    decimal Expenses,
    decimal NetProfit);

public sealed record ExpenseCategoryDto(
    string Category,
    decimal Amount,
    double Percentage);
