using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class AdminDashboardService(PerfiumesDbContext db, ProductRepository products)
{
    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[UserWallets]', N'U') IS NULL
BEGIN
    CREATE TABLE [UserWallets] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_UserWallets] PRIMARY KEY,
        [UserId] nvarchar(64) NOT NULL,
        [UserEmail] nvarchar(256) NOT NULL,
        [Balance] decimal(18,2) NOT NULL,
        [LifetimeCredit] decimal(18,2) NOT NULL,
        [LifetimeDebit] decimal(18,2) NOT NULL,
        [Currency] nvarchar(8) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [FK_UserWallets_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [Users] ([Id]) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX [IX_UserWallets_UserId] ON [UserWallets] ([UserId]);
    CREATE INDEX [IX_UserWallets_UserEmail] ON [UserWallets] ([UserEmail]);
END

IF OBJECT_ID(N'[WalletTransactions]', N'U') IS NULL
BEGIN
    CREATE TABLE [WalletTransactions] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_WalletTransactions] PRIMARY KEY,
        [WalletId] nvarchar(64) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Type] nvarchar(24) NOT NULL,
        [ActorRole] nvarchar(24) NOT NULL,
        [Reason] nvarchar(260) NOT NULL,
        [ReferenceId] nvarchar(120) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [FK_WalletTransactions_UserWallets_WalletId] FOREIGN KEY ([WalletId]) REFERENCES [UserWallets] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_WalletTransactions_WalletId] ON [WalletTransactions] ([WalletId]);
END

IF COL_LENGTH(N'[WalletTransactions]', N'ActorRole') IS NULL
BEGIN
    -- SQL Server validates all column references in this batch before executing it.
    -- Run the schema change and its backfill in separate dynamic batches so an
    -- existing database without ActorRole can be upgraded safely.
    EXEC sys.sp_executesql N'
        ALTER TABLE [WalletTransactions]
        ADD [ActorRole] nvarchar(24) NOT NULL
            CONSTRAINT [DF_WalletTransactions_ActorRole] DEFAULT N''system'' WITH VALUES;';

    EXEC sys.sp_executesql N'
        UPDATE [WalletTransactions]
        SET [ActorRole] = CASE
            WHEN [Reason] LIKE N''Payment for order %''
                OR [Reason] LIKE N''Refund for cancelled order %''
                OR [ReferenceId] LIKE N''topup_%'' THEN N''customer''
            WHEN [Reason] LIKE N''Admin adjustment%'' THEN N''admin''
            ELSE N''system''
        END;';
END

IF OBJECT_ID(N'[AdminExpenses]', N'U') IS NULL
BEGIN
    CREATE TABLE [AdminExpenses] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_AdminExpenses] PRIMARY KEY,
        [Title] nvarchar(256) NOT NULL,
        [Category] nvarchar(64) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Description] nvarchar(1024) NULL,
        [Date] datetimeoffset NOT NULL,
        [CreatedByEmail] nvarchar(256) NOT NULL,
        [ReceiptUrl] nvarchar(1024) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL
    );
    CREATE INDEX [IX_AdminExpenses_Date] ON [AdminExpenses] ([Date]);
    CREATE INDEX [IX_AdminExpenses_Category] ON [AdminExpenses] ([Category]);
END

IF OBJECT_ID(N'[WalletTopUpRequests]', N'U') IS NULL
BEGIN
    CREATE TABLE [WalletTopUpRequests] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_WalletTopUpRequests] PRIMARY KEY,
        [UserId] nvarchar(64) NOT NULL,
        [UserEmail] nvarchar(256) NOT NULL,
        [Amount] decimal(18,2) NOT NULL,
        [Currency] nvarchar(8) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [PaymentProvider] nvarchar(64) NOT NULL,
        [ProviderTransactionId] nvarchar(128) NULL,
        [ClientSecret] nvarchar(256) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [CompletedAt] datetimeoffset NULL
    );
    CREATE INDEX [IX_WalletTopUpRequests_UserEmail] ON [WalletTopUpRequests] ([UserEmail]);
    CREATE INDEX [IX_WalletTopUpRequests_Status] ON [WalletTopUpRequests] ([Status]);
END
""");

        await EnsureWalletsForUsersAsync();
        await EnsureDemoDashboardDataAsync();
        await EnsureDemoExpensesAsync();
    }

    public async Task<AdminDashboardSummaryDto> GetSummaryAsync()
    {
        await EnsureWalletsForUsersAsync();

        var productsCount = await db.Products.CountAsync();
        var totalUsers = await db.Users.CountAsync();
        var totalCustomers = await db.Users.CountAsync(user => user.Role == "customer");
        var totalOrders = await db.Orders.CountAsync();
        var openSupport = await db.SupportConversations.CountAsync(item => item.Status != "closed");
        var revenue = await db.Orders
            .Where(order => order.Status != "Cancelled")
            .SumAsync(order => (decimal?)order.Total) ?? 0;
        var walletBalance = await db.UserWallets.SumAsync(wallet => (decimal?)wallet.Balance) ?? 0;
        var completedSalesOrders = await db.Orders.CountAsync(order => order.Status != "Cancelled");
        var averageOrderValue = completedSalesOrders == 0 ? 0 : Math.Round(revenue / completedSalesOrders, 2);
        var pendingOrders = await db.Orders.CountAsync(order => order.Status == "Processing" || order.Status == "Packed");
        var lowStockProducts = await db.Products.CountAsync(product => product.StockQuantity <= 5);

        var recentOrders = await db.Orders
            .AsNoTracking()
            .OrderByDescending(order => order.Date)
            .Take(6)
            .Select(order => new AdminDashboardOrderDto(order.Id, order.UserEmail, order.Status, order.Total, order.Date))
            .ToListAsync();

        var wallets = await GetWalletsAsync();

        return new AdminDashboardSummaryDto(
            totalUsers,
            totalCustomers,
            productsCount,
            totalOrders,
            openSupport,
            revenue,
            walletBalance,
            averageOrderValue,
            pendingOrders,
            lowStockProducts,
            recentOrders,
            wallets.Take(8).ToList());
    }

    public async Task<IReadOnlyList<AdminWalletDto>> GetWalletsAsync()
    {
        await EnsureWalletsForUsersAsync();

        return await db.UserWallets
            .AsNoTracking()
            .Include(wallet => wallet.User)
            .OrderByDescending(wallet => wallet.UpdatedAt)
            .Select(wallet => new AdminWalletDto(
                wallet.Id,
                wallet.UserId,
                wallet.User == null ? wallet.UserEmail : wallet.User.FullName,
                wallet.UserEmail,
                wallet.Balance,
                wallet.LifetimeCredit,
                wallet.LifetimeDebit,
                wallet.Currency,
                wallet.UpdatedAt))
            .ToListAsync();
    }

    public async Task<IReadOnlyList<AdminWalletTransactionDto>> GetCustomerWalletTransactionsAsync()
    {
        return await db.WalletTransactions
            .AsNoTracking()
            .Where(transaction => transaction.ActorRole == "customer")
            .OrderByDescending(transaction => transaction.CreatedAt)
            .Take(250)
            .Select(transaction => new AdminWalletTransactionDto(
                transaction.Id,
                transaction.WalletId,
                transaction.Wallet!.User == null ? transaction.Wallet.UserEmail : transaction.Wallet.User.FullName,
                transaction.Wallet!.UserEmail,
                transaction.Amount,
                transaction.Type,
                transaction.Reason,
                transaction.ReferenceId,
                transaction.Wallet.Currency,
                transaction.CreatedAt))
            .ToListAsync();
    }

    public async Task<UserWalletDto?> GetWalletForUserAsync(string userEmail)
    {
        await EnsureWalletsForUsersAsync();
        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var wallet = await db.UserWallets
            .AsNoTracking()
            .Include(item => item.Transactions)
            .FirstOrDefaultAsync(item => item.UserEmail == normalizedEmail);

        return wallet is null ? null : ToUserWalletDto(wallet);
    }

    public async Task<UserWalletDto?> TopUpWalletForUserAsync(string userEmail, TopUpWalletRequest request)
    {
        if (request.Amount <= 0)
        {
            return null;
        }

        await EnsureWalletsForUsersAsync();
        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var wallet = await db.UserWallets
            .Include(item => item.Transactions)
            .FirstOrDefaultAsync(item => item.UserEmail == normalizedEmail);

        if (wallet is null)
        {
            return null;
        }

        var amount = Math.Round(request.Amount, 2);
        var now = DateTimeOffset.UtcNow;

        wallet.Balance += amount;
        wallet.LifetimeCredit += amount;
        wallet.UpdatedAt = now;
        wallet.Transactions.Add(new WalletTransactionEntity
        {
            Id = $"wtx_{Guid.NewGuid():N}",
            WalletId = wallet.Id,
            Amount = amount,
            Type = "credit",
            ActorRole = "customer",
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? "Wallet top up" : request.Reason.Trim(),
            ReferenceId = $"topup_{Guid.NewGuid():N}",
            CreatedAt = now
        });

        await db.SaveChangesAsync();
        return ToUserWalletDto(wallet);
    }

    public async Task<WalletTopUpEntity?> CreateTopUpRequestAsync(string userEmail, decimal amount)
    {
        if (amount <= 0) return null;

        await EnsureWalletsForUsersAsync();
        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (user is null) return null;

        var topUp = new WalletTopUpEntity
        {
            Id = $"wtop_{Guid.NewGuid():N}",
            UserId = user.Id,
            UserEmail = normalizedEmail,
            Amount = Math.Round(amount, 2),
            Currency = "EGP",
            Status = "pending",
            PaymentProvider = "Paymob",
            CreatedAt = DateTimeOffset.UtcNow
        };

        db.WalletTopUpRequests.Add(topUp);
        await db.SaveChangesAsync();
        return topUp;
    }

    public async Task<WalletTopUpEntity?> GetTopUpRequestByIdAsync(string id)
    {
        return await db.WalletTopUpRequests.FirstOrDefaultAsync(t => t.Id == id);
    }

    public async Task<(WalletTopUpEntity TopUp, UserWalletDto? Wallet)?> CompleteTopUpAsync(string id, string? transactionId)
    {
        var topUp = await db.WalletTopUpRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (topUp is null) return null;

        var wallet = await db.UserWallets
            .Include(w => w.Transactions)
            .FirstOrDefaultAsync(w => w.UserEmail == topUp.UserEmail);

        if (wallet is null) return null;

        if (topUp.Status == "paid")
        {
            return (topUp, ToUserWalletDto(wallet));
        }

        var now = DateTimeOffset.UtcNow;
        topUp.Status = "paid";
        topUp.CompletedAt = now;
        if (!string.IsNullOrWhiteSpace(transactionId))
        {
            topUp.ProviderTransactionId = transactionId.Trim();
        }

        wallet.Balance += topUp.Amount;
        wallet.LifetimeCredit += topUp.Amount;
        wallet.UpdatedAt = now;

        wallet.Transactions.Add(new WalletTransactionEntity
        {
            Id = $"wtx_{Guid.NewGuid():N}",
            WalletId = wallet.Id,
            Amount = topUp.Amount,
            Type = "credit",
            ActorRole = "customer",
            Reason = "Wallet top up via Card (Paymob)",
            ReferenceId = string.IsNullOrWhiteSpace(transactionId) ? topUp.Id : transactionId.Trim(),
            CreatedAt = now
        });

        await db.SaveChangesAsync();
        return (topUp, ToUserWalletDto(wallet));
    }

    public async Task<WalletTopUpEntity?> FailTopUpAsync(string id, string? transactionId)
    {
        var topUp = await db.WalletTopUpRequests.FirstOrDefaultAsync(t => t.Id == id);
        if (topUp is null || topUp.Status == "paid") return topUp;

        topUp.Status = "failed";
        topUp.CompletedAt = DateTimeOffset.UtcNow;
        if (!string.IsNullOrWhiteSpace(transactionId))
        {
            topUp.ProviderTransactionId = transactionId.Trim();
        }

        await db.SaveChangesAsync();
        return topUp;
    }

    public async Task<AdminWalletDto?> AdjustWalletAsync(string walletId, AdjustWalletRequest request)
    {
        var wallet = await db.UserWallets.Include(item => item.User).FirstOrDefaultAsync(item => item.Id == walletId);
        if (wallet is null || request.Amount <= 0)
        {
            return null;
        }

        var type = request.Type.Trim().Equals("debit", StringComparison.OrdinalIgnoreCase) ? "debit" : "credit";
        var amount = Math.Round(request.Amount, 2);
        var now = DateTimeOffset.UtcNow;

        if (type == "debit")
        {
            wallet.Balance -= amount;
            wallet.LifetimeDebit += amount;
        }
        else
        {
            wallet.Balance += amount;
            wallet.LifetimeCredit += amount;
        }

        wallet.UpdatedAt = now;
        wallet.Transactions.Add(new WalletTransactionEntity
        {
            Id = $"wtx_{Guid.NewGuid():N}",
            WalletId = wallet.Id,
            Amount = amount,
            Type = type,
            ActorRole = "admin",
            Reason = string.IsNullOrWhiteSpace(request.Reason) ? "Admin adjustment" : request.Reason.Trim(),
            ReferenceId = request.ReferenceId?.Trim(),
            CreatedAt = now
        });

        await db.SaveChangesAsync();
        return new AdminWalletDto(wallet.Id, wallet.UserId, wallet.User?.FullName ?? wallet.UserEmail, wallet.UserEmail, wallet.Balance, wallet.LifetimeCredit, wallet.LifetimeDebit, wallet.Currency, wallet.UpdatedAt);
    }

    private async Task EnsureWalletsForUsersAsync()
    {
        var users = await db.Users
            .AsNoTracking()
            .Where(user => !db.UserWallets.Any(wallet => wallet.UserId == user.Id))
            .ToListAsync();
        if (users.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;

        foreach (var user in users)
        {
            db.UserWallets.Add(new UserWalletEntity
            {
                Id = $"wallet_{Guid.NewGuid():N}",
                UserId = user.Id,
                UserEmail = user.Email,
                Balance = 0,
                LifetimeCredit = 0,
                LifetimeDebit = 0,
                Currency = "EGP",
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await db.SaveChangesAsync();
    }

    private static UserWalletDto ToUserWalletDto(UserWalletEntity wallet)
    {
        return new UserWalletDto(
            wallet.Id,
            wallet.Balance,
            wallet.LifetimeCredit,
            wallet.LifetimeDebit,
            wallet.Currency,
            wallet.UpdatedAt,
            wallet.Transactions
                .OrderByDescending(item => item.CreatedAt)
                .Take(12)
                .Select(item => new WalletTransactionDto(item.Id, item.Amount, item.Type, item.Reason, item.ReferenceId, item.CreatedAt))
                .ToList());
    }

    private async Task EnsureDemoDashboardDataAsync()
    {
        var customers = await db.Users
            .Where(user => user.Role == "customer")
            .OrderBy(user => user.Id)
            .Take(6)
            .ToListAsync();
        if (customers.Count == 0)
        {
            return;
        }

        var productsList = (await products.GetAllAsync()).Take(6).ToList();
        if (productsList.Count > 0 && !await db.Orders.AnyAsync(order => order.Id.StartsWith("ORD-DEMO-")))
        {
            var now = DateTimeOffset.UtcNow;
            var statuses = new[] { "Processing", "Packed", "Shipped", "OutForDelivery", "Delivered", "Cancelled" };

            for (var index = 0; index < Math.Min(customers.Count, productsList.Count); index++)
            {
                var customer = customers[index];
                var product = productsList[index];
                var quantity = index % 3 + 1;
                var subtotal = product.Price * quantity;
                var discount = index % 2 == 0 ? Math.Round(subtotal * 0.1m, 2) : 0;
                var total = subtotal - discount;
                var status = statuses[index % statuses.Length];
                var orderDate = now.AddDays(-index - 1);
                var orderId = $"ORD-DEMO-{1001 + index}";

                var order = new OrderEntity
                {
                    Id = orderId,
                    UserEmail = customer.Email,
                    Status = status,
                    Date = orderDate,
                    Subtotal = subtotal,
                    Discount = discount,
                    Total = total,
                    ShippingName = customer.FullName,
                    ShippingStreet = string.IsNullOrWhiteSpace(customer.Address) ? "Cairo" : customer.Address,
                    ShippingCity = index % 2 == 0 ? "Cairo" : "Alexandria",
                    ShippingState = string.Empty,
                    ShippingZip = $"11{index}0{index}",
                    ShippingCountry = "Egypt",
                    PromoCode = discount > 0 ? "DEMO10" : null
                };

                order.Items.Add(new OrderItemEntity
                {
                    Id = $"demo_item_{index + 1}",
                    OrderId = orderId,
                    ProductId = product.Id,
                    Name = product.Name,
                    Price = product.Price,
                    Image = product.Image,
                    Quantity = quantity
                });

                order.TrackingEvents.Add(new OrderTrackingEventEntity
                {
                    Id = $"demo_track_{index + 1}",
                    OrderId = orderId,
                    Status = status,
                    Title = status,
                    Description = status == "Delivered"
                        ? "Demo order delivered successfully."
                        : "Demo tracking update for dashboard testing.",
                    CreatedAt = orderDate.AddHours(3)
                });

                db.Orders.Add(order);
            }
        }

        if (!await db.SupportConversations.AnyAsync(item => item.Id.StartsWith("support_demo_")))
        {
            var now = DateTimeOffset.UtcNow;
            for (var index = 0; index < Math.Min(3, customers.Count); index++)
            {
                var customer = customers[index];
                var conversationId = $"support_demo_{index + 1}";
                var createdAt = now.AddHours(-8 - index);
                db.SupportConversations.Add(new SupportConversationEntity
                {
                    Id = conversationId,
                    UserId = customer.Id,
                    UserName = customer.FullName,
                    UserEmail = customer.Email,
                    Subject = index == 0 ? "Need help with order" : index == 1 ? "Wallet question" : "Perfume recommendation",
                    Status = index == 2 ? "answered" : "open",
                    CreatedAt = createdAt,
                    UpdatedAt = createdAt.AddMinutes(25),
                    Messages =
                    [
                        new SupportMessageEntity
                        {
                            Id = $"support_demo_msg_{index + 1}",
                            ConversationId = conversationId,
                            SenderRole = "customer",
                            SenderName = customer.FullName,
                            SenderEmail = customer.Email,
                            Body = index == 0 ? "My order tracking did not update yet." : "Can I use my wallet balance at checkout?",
                            CreatedAt = createdAt
                        }
                    ]
                });
            }
        }

        var customerIds = customers.Select(customer => customer.Id).ToList();
        var wallets = await db.UserWallets
            .Include(wallet => wallet.Transactions)
            .Where(wallet => customerIds.Contains(wallet.UserId))
            .ToListAsync();
        if (wallets.Count > 0 && wallets.All(wallet => wallet.Balance == 0 && wallet.LifetimeCredit == 0))
        {
            for (var index = 0; index < wallets.Count; index++)
            {
                var amount = 150 + index * 75;
                wallets[index].Balance = amount;
                wallets[index].LifetimeCredit = amount;
                wallets[index].UpdatedAt = DateTimeOffset.UtcNow.AddMinutes(-index * 12);
                wallets[index].Transactions.Add(new WalletTransactionEntity
                {
                    Id = $"demo_wallet_tx_{index + 1}",
                    WalletId = wallets[index].Id,
                    Amount = amount,
                    Type = "credit",
                    ActorRole = "system",
                    Reason = "Demo opening balance",
                    ReferenceId = "demo-seed",
                    CreatedAt = wallets[index].UpdatedAt
                });
            }
        }

        await db.SaveChangesAsync();
    }

    private async Task EnsureDemoExpensesAsync()
    {
        if (await db.AdminExpenses.AnyAsync())
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        db.AdminExpenses.AddRange(
            new AdminExpenseEntity
            {
                Id = "EXP-8901",
                Title = "Meta & Instagram Fragrance Ads Campaign",
                Category = "Marketing",
                Amount = 8500m,
                Description = "Sponsored video promotion for Nubian Amber and Royal Lotus launch across Cairo and Alexandria.",
                Date = now.AddDays(-1),
                CreatedByEmail = "admin@gnouby.local",
                ReceiptUrl = "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80",
                CreatedAt = now.AddDays(-1),
                UpdatedAt = now.AddDays(-1)
            },
            new AdminExpenseEntity
            {
                Id = "EXP-8902",
                Title = "Luxury Gold-Foil Packaging Bottles (Batch 400)",
                Category = "Packaging",
                Amount = 14200m,
                Description = "Custom embossed amber crystal bottles and black velvet presentation boxes from Alexandria glassworks.",
                Date = now.AddDays(-3),
                CreatedByEmail = "admin@gnouby.local",
                ReceiptUrl = "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80",
                CreatedAt = now.AddDays(-3),
                UpdatedAt = now.AddDays(-3)
            },
            new AdminExpenseEntity
            {
                Id = "EXP-8903",
                Title = "Courier Logistics & Local Delivery Settlements",
                Category = "Logistics",
                Amount = 3600m,
                Description = "Weekly settlement for express courier deliveries covering Greater Cairo, Giza, and Delta regions.",
                Date = now.AddDays(-5),
                CreatedByEmail = "admin@gnouby.local",
                ReceiptUrl = null,
                CreatedAt = now.AddDays(-5),
                UpdatedAt = now.AddDays(-5)
            },
            new AdminExpenseEntity
            {
                Id = "EXP-8904",
                Title = "Warehouse & Showroom Electricity & Cooling",
                Category = "Utilities",
                Amount = 2450m,
                Description = "Monthly electricity bill for temperature-controlled fragrance storage facility.",
                Date = now.AddDays(-8),
                CreatedByEmail = "admin@gnouby.local",
                ReceiptUrl = null,
                CreatedAt = now.AddDays(-8),
                UpdatedAt = now.AddDays(-8)
            },
            new AdminExpenseEntity
            {
                Id = "EXP-8905",
                Title = "Perfumer Laboratory Essential Oils & Resins",
                Category = "Inventory",
                Amount = 19800m,
                Description = "Imported pure Agarwood (Oud), Egyptian Jasmine absolute, and natural Frankincense resin.",
                Date = now.AddDays(-12),
                CreatedByEmail = "admin@gnouby.local",
                ReceiptUrl = "https://images.unsplash.com/photo-1615397349754-cfa2066a298e?auto=format&fit=crop&w=800&q=80",
                CreatedAt = now.AddDays(-12),
                UpdatedAt = now.AddDays(-12)
            }
        );

        await db.SaveChangesAsync();
    }

    // ============================================================
    // Finance Dashboard Methods
    // ============================================================

    public async Task<FinancialSummaryDto> GetFinancialSummaryAsync(string period, DateTimeOffset? startDate, DateTimeOffset? endDate)
    {
        await EnsureDemoExpensesAsync();
        var (currentStart, currentEnd) = GetPeriodRange(period, startDate, endDate);
        var periodLength = currentEnd - currentStart;
        var previousStart = currentStart - periodLength;
        var previousEnd = currentStart;

        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.Date >= previousStart && o.Date < currentEnd && o.Status != "Cancelled")
            .Select(o => new { o.Date, o.Total })
            .ToListAsync();

        var expenses = await db.AdminExpenses.AsNoTracking()
            .Where(e => e.Date >= previousStart && e.Date < currentEnd)
            .Select(e => new { e.Date, e.Amount })
            .ToListAsync();

        var currentRevenue = orders.Where(o => o.Date >= currentStart && o.Date < currentEnd).Sum(o => o.Total);
        var previousRevenue = orders.Where(o => o.Date >= previousStart && o.Date < previousEnd).Sum(o => o.Total);

        var currentExpenses = expenses.Where(e => e.Date >= currentStart && e.Date < currentEnd).Sum(e => e.Amount);
        var previousExpenses = expenses.Where(e => e.Date >= previousStart && e.Date < previousEnd).Sum(e => e.Amount);

        var currentProfit = currentRevenue - currentExpenses;
        var previousProfit = previousRevenue - previousExpenses;

        var currentOrderCount = orders.Count(o => o.Date >= currentStart && o.Date < currentEnd);
        var expensesCount = expenses.Count(e => e.Date >= currentStart && e.Date < currentEnd);

        return new FinancialSummaryDto(
            Math.Round(currentRevenue, 2),
            Math.Round(currentExpenses, 2),
            Math.Round(currentProfit, 2),
            currentOrderCount + expensesCount,
            CalculateChangePercent(previousRevenue, currentRevenue),
            CalculateChangePercent(previousExpenses, currentExpenses),
            CalculateChangePercent(previousProfit, currentProfit));
    }

    public async Task<IReadOnlyList<FinancialFlowPointDto>> GetFinancialFlowAsync(string period, DateTimeOffset? startDate, DateTimeOffset? endDate)
    {
        await EnsureDemoExpensesAsync();
        var (rangeStart, rangeEnd) = GetPeriodRange(period, startDate, endDate);
        var points = new List<FinancialFlowPointDto>();

        var orders = await db.Orders.AsNoTracking()
            .Where(o => o.Date >= rangeStart && o.Date < rangeEnd && o.Status != "Cancelled")
            .Select(o => new { o.Date, o.Total })
            .ToListAsync();

        var expenses = await db.AdminExpenses.AsNoTracking()
            .Where(e => e.Date >= rangeStart && e.Date < rangeEnd)
            .Select(e => new { e.Date, e.Amount })
            .ToListAsync();

        if (period is "today" or "yesterday")
        {
            for (int h = 0; h < 24; h++)
            {
                var hourStart = rangeStart.AddHours(h);
                var hourEnd = hourStart.AddHours(1);
                if (hourStart >= rangeEnd) break;
                var rev = orders.Where(o => o.Date >= hourStart && o.Date < hourEnd).Sum(o => o.Total);
                var exp = expenses.Where(e => e.Date >= hourStart && e.Date < hourEnd).Sum(e => e.Amount);
                points.Add(new FinancialFlowPointDto(hourStart.ToString("HH:mm"), Math.Round(rev, 2), Math.Round(exp, 2), Math.Round(rev - exp, 2)));
            }
        }
        else if (period is "this-year" or "last-year")
        {
            var current = new DateTimeOffset(rangeStart.Year, rangeStart.Month, 1, 0, 0, 0, rangeStart.Offset);
            while (current < rangeEnd)
            {
                var monthEnd = current.AddMonths(1);
                var rev = orders.Where(o => o.Date >= current && o.Date < monthEnd).Sum(o => o.Total);
                var exp = expenses.Where(e => e.Date >= current && e.Date < monthEnd).Sum(e => e.Amount);
                points.Add(new FinancialFlowPointDto(current.ToString("MMM"), Math.Round(rev, 2), Math.Round(exp, 2), Math.Round(rev - exp, 2)));
                current = monthEnd;
            }
        }
        else
        {
            var current = new DateTimeOffset(rangeStart.Year, rangeStart.Month, rangeStart.Day, 0, 0, 0, rangeStart.Offset);
            while (current < rangeEnd)
            {
                var dayEnd = current.AddDays(1);
                var rev = orders.Where(o => o.Date >= current && o.Date < dayEnd).Sum(o => o.Total);
                var exp = expenses.Where(e => e.Date >= current && e.Date < dayEnd).Sum(e => e.Amount);
                points.Add(new FinancialFlowPointDto(current.ToString("MMM dd"), Math.Round(rev, 2), Math.Round(exp, 2), Math.Round(rev - exp, 2)));
                current = dayEnd;
            }
        }

        return points;
    }

    public async Task<IReadOnlyList<ExpenseCategoryDto>> GetExpenseCategoriesAsync(string period, DateTimeOffset? startDate, DateTimeOffset? endDate)
    {
        await EnsureDemoExpensesAsync();
        var (rangeStart, rangeEnd) = GetPeriodRange(period, startDate, endDate);
        var expenses = await db.AdminExpenses.AsNoTracking().Where(e => e.Date >= rangeStart && e.Date < rangeEnd).ToListAsync();
        var total = expenses.Sum(e => e.Amount);
        if (total == 0) return [];

        return expenses
            .GroupBy(e => e.Category)
            .Select(g => new ExpenseCategoryDto(
                g.Key,
                Math.Round(g.Sum(e => e.Amount), 2),
                total > 0 ? Math.Round((double)(g.Sum(e => e.Amount) / total * 100), 1) : 0))
            .OrderByDescending(c => c.Amount)
            .ToList();
    }

    public async Task<IReadOnlyList<ExpenseDto>> GetExpensesAsync(string? search, string? category, DateTimeOffset? startDate, DateTimeOffset? endDate)
    {
        await EnsureDemoExpensesAsync();
        var query = db.AdminExpenses.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(e => e.Title.Contains(search));

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(e => e.Category == category);

        if (startDate.HasValue)
            query = query.Where(e => e.Date >= startDate.Value);

        if (endDate.HasValue)
            query = query.Where(e => e.Date < endDate.Value);

        return await query
            .OrderByDescending(e => e.Date)
            .Select(e => new ExpenseDto(e.Id, e.Title, e.Category, e.Amount, e.Description, e.Date, e.CreatedByEmail, e.ReceiptUrl, e.CreatedAt, e.UpdatedAt))
            .ToListAsync();
    }

    public async Task<ExpenseDto> CreateExpenseAsync(CreateExpenseRequest request, string adminEmail)
    {
        var now = DateTimeOffset.UtcNow;
        var expense = new Perfiumes.Api.Data.Entities.AdminExpenseEntity
        {
            Id = $"exp_{Guid.NewGuid():N}",
            Title = request.Title.Trim(),
            Category = request.Category.Trim(),
            Amount = Math.Round(request.Amount, 2),
            Description = request.Description?.Trim(),
            Date = request.Date ?? now,
            CreatedByEmail = adminEmail,
            ReceiptUrl = request.ReceiptUrl?.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };

        db.AdminExpenses.Add(expense);
        await db.SaveChangesAsync();
        return ToExpenseDto(expense);
    }

    public async Task<ExpenseDto?> UpdateExpenseAsync(string id, UpdateExpenseRequest request)
    {
        var expense = await db.AdminExpenses.FindAsync(id);
        if (expense is null) return null;

        expense.Title = request.Title.Trim();
        expense.Category = request.Category.Trim();
        expense.Amount = Math.Round(request.Amount, 2);
        expense.Description = request.Description?.Trim();
        if (request.Date.HasValue) expense.Date = request.Date.Value;
        expense.ReceiptUrl = request.ReceiptUrl?.Trim();
        expense.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return ToExpenseDto(expense);
    }

    public async Task<bool> DeleteExpenseAsync(string id)
    {
        var expense = await db.AdminExpenses.FindAsync(id);
        if (expense is null) return false;
        db.AdminExpenses.Remove(expense);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task<decimal> GetExpensesTotalAsync(DateTimeOffset start, DateTimeOffset end)
    {
        return await db.AdminExpenses
            .Where(e => e.Date >= start && e.Date < end)
            .SumAsync(e => (decimal?)e.Amount) ?? 0;
    }

    private static (DateTimeOffset start, DateTimeOffset end) GetPeriodRange(string period, DateTimeOffset? startDate, DateTimeOffset? endDate)
    {
        var now = DateTimeOffset.UtcNow;
        var todayStart = new DateTimeOffset(now.Year, now.Month, now.Day, 0, 0, 0, now.Offset);
        return period switch
        {
            "today" => (todayStart, todayStart.AddDays(1)),
            "yesterday" => (todayStart.AddDays(-1), todayStart),
            "this-week" => (todayStart.AddDays(-(int)now.DayOfWeek), todayStart.AddDays(7 - (int)now.DayOfWeek)),
            "last-week" => (todayStart.AddDays(-(int)now.DayOfWeek - 7), todayStart.AddDays(-(int)now.DayOfWeek)),
            "this-month" => (new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, now.Offset), new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, now.Offset).AddMonths(1)),
            "last-month" => (new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, now.Offset).AddMonths(-1), new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, now.Offset)),
            "this-year" => (new DateTimeOffset(now.Year, 1, 1, 0, 0, 0, now.Offset), new DateTimeOffset(now.Year + 1, 1, 1, 0, 0, 0, now.Offset)),
            "last-year" => (new DateTimeOffset(now.Year - 1, 1, 1, 0, 0, 0, now.Offset), new DateTimeOffset(now.Year, 1, 1, 0, 0, 0, now.Offset)),
            "custom" when startDate.HasValue && endDate.HasValue => (startDate.Value, endDate.Value),
            _ => (todayStart.AddDays(-30), now)
        };
    }

    private static decimal CalculateChangePercent(decimal previous, decimal current)
    {
        if (previous == 0) return current > 0 ? 100 : 0;
        return Math.Round((current - previous) / Math.Abs(previous) * 100, 1);
    }

    private static ExpenseDto ToExpenseDto(Perfiumes.Api.Data.Entities.AdminExpenseEntity e) =>
        new(e.Id, e.Title, e.Category, e.Amount, e.Description, e.Date, e.CreatedByEmail, e.ReceiptUrl, e.CreatedAt, e.UpdatedAt);
}

