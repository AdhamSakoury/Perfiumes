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
        [Reason] nvarchar(260) NOT NULL,
        [ReferenceId] nvarchar(120) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [FK_WalletTransactions_UserWallets_WalletId] FOREIGN KEY ([WalletId]) REFERENCES [UserWallets] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_WalletTransactions_WalletId] ON [WalletTransactions] ([WalletId]);
END
""");

        await EnsureWalletsForUsersAsync();
        await EnsureDemoDashboardDataAsync();
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
                    Reason = "Demo opening balance",
                    ReferenceId = "demo-seed",
                    CreatedAt = wallets[index].UpdatedAt
                });
            }
        }

        await db.SaveChangesAsync();
    }
}
