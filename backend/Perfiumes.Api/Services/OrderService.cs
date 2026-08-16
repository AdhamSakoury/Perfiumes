using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class OrderService(PerfiumesDbContext db)
{
    private static readonly IReadOnlyDictionary<string, (string Title, string Description)> TrackingCopy =
        new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            ["Processing"] = ("Order confirmed", "We received your order and started preparing it."),
            ["Packed"] = ("Packed", "Your perfumes are packed and ready for courier pickup."),
            ["Shipped"] = ("Shipped", "Your order left our store and is on its way."),
            ["OutForDelivery"] = ("Out for delivery", "The courier is heading to your address."),
            ["Delivered"] = ("Delivered", "Your order has arrived. Enjoy your fragrance."),
            ["Cancelled"] = ("Cancelled", "This order has been cancelled.")
        };

    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[Orders]', N'U') IS NULL
BEGIN
    CREATE TABLE [Orders] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_Orders] PRIMARY KEY,
        [UserEmail] nvarchar(256) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [Date] datetimeoffset NOT NULL,
        [Subtotal] decimal(18,2) NOT NULL,
        [Discount] decimal(18,2) NOT NULL,
        [Total] decimal(18,2) NOT NULL,
        [ShippingName] nvarchar(160) NOT NULL,
        [ShippingStreet] nvarchar(500) NOT NULL,
        [ShippingCity] nvarchar(120) NOT NULL,
        [ShippingState] nvarchar(120) NOT NULL,
        [ShippingZip] nvarchar(40) NOT NULL,
        [ShippingCountry] nvarchar(120) NOT NULL,
        [PromoCode] nvarchar(80) NULL
    );
END

IF OBJECT_ID(N'[OrderItems]', N'U') IS NULL
BEGIN
    CREATE TABLE [OrderItems] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_OrderItems] PRIMARY KEY,
        [OrderId] nvarchar(64) NOT NULL,
        [ProductId] int NOT NULL,
        [Name] nvarchar(220) NOT NULL,
        [Price] decimal(18,2) NOT NULL,
        [Image] nvarchar(1000) NOT NULL,
        [Quantity] int NOT NULL,
        CONSTRAINT [FK_OrderItems_Orders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_OrderItems_OrderId] ON [OrderItems] ([OrderId]);
END

IF OBJECT_ID(N'[OrderTrackingEvents]', N'U') IS NULL
BEGIN
    CREATE TABLE [OrderTrackingEvents] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_OrderTrackingEvents] PRIMARY KEY,
        [OrderId] nvarchar(64) NOT NULL,
        [Status] nvarchar(32) NOT NULL,
        [Title] nvarchar(160) NOT NULL,
        [Description] nvarchar(500) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [FK_OrderTrackingEvents_Orders_OrderId] FOREIGN KEY ([OrderId]) REFERENCES [Orders] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_OrderTrackingEvents_OrderId] ON [OrderTrackingEvents] ([OrderId]);
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_UserEmail' AND object_id = OBJECT_ID(N'[Orders]'))
    CREATE INDEX [IX_Orders_UserEmail] ON [Orders] ([UserEmail]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_Date' AND object_id = OBJECT_ID(N'[Orders]'))
    CREATE INDEX [IX_Orders_Date] ON [Orders] ([Date]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_Status_Date' AND object_id = OBJECT_ID(N'[Orders]'))
    CREATE INDEX [IX_Orders_Status_Date] ON [Orders] ([Status], [Date]);

IF COL_LENGTH(N'[Orders]', N'PaymentMethod') IS NULL
    ALTER TABLE [Orders] ADD [PaymentMethod] nvarchar(32) NOT NULL CONSTRAINT [DF_Orders_PaymentMethod] DEFAULT N'cashOnDelivery';

IF COL_LENGTH(N'[Orders]', N'PaymentStatus') IS NULL
    ALTER TABLE [Orders] ADD [PaymentStatus] nvarchar(32) NOT NULL CONSTRAINT [DF_Orders_PaymentStatus] DEFAULT N'pending';
""");
    }

    public async Task<IReadOnlyList<OrderDto>> GetForUserAsync(string userEmail)
    {
        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var orders = await db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Include(order => order.Items)
            .Include(order => order.TrackingEvents)
            .Where(order => order.UserEmail == normalizedEmail)
            .OrderByDescending(order => order.Date)
            .ToListAsync();

        return orders.Select(ToDto).ToList();
    }

    public async Task<IReadOnlyList<OrderDto>> GetAllAsync()
    {
        var orders = await db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Include(order => order.Items)
            .Include(order => order.TrackingEvents)
            .OrderByDescending(order => order.Date)
            .ToListAsync();

        return orders.Select(ToDto).ToList();
    }

    public async Task<OrderDto?> GetByIdAsync(string id)
    {
        var order = await db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id);

        return order is null ? null : ToDto(order);
    }

    public async Task<OrderDto> CreateAsync(CreateOrderRequest request, string? authenticatedEmail = null)
    {
        var now = DateTimeOffset.UtcNow;
        var id = $"ORD-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():X}";
        var normalizedEmail = request.UserEmail.Trim().ToLowerInvariant();
        var paymentMethod = NormalizePaymentMethod(request.PaymentMethod);
        var paymentStatus = paymentMethod == "wallet" ? "paid" : "pending";
        var subtotal = Math.Round(request.Subtotal, 2);
        var promoCode = NormalizePromoCode(request.PromoCode);
        var discount = 0m;

        if (promoCode is not null)
        {
            var promo = await db.PromoCodes
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.Code == promoCode && item.IsActive && item.ExpiresAt > now);

            if (promo is null)
            {
                throw new InvalidOperationException("Invalid or expired promo code.");
            }

            discount = Math.Round(subtotal * promo.Discount, 2);
        }

        var total = Math.Max(0, Math.Round(subtotal - discount, 2));

        if (paymentMethod == "wallet")
        {
            if (string.IsNullOrWhiteSpace(authenticatedEmail)
                || !authenticatedEmail.Trim().Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Wallet payment requires the logged-in customer.");
            }

            var wallet = await db.UserWallets
                .Include(item => item.Transactions)
                .FirstOrDefaultAsync(item => item.UserEmail == normalizedEmail);
            if (wallet is null)
            {
                throw new InvalidOperationException("Wallet was not found for this customer.");
            }

            var amount = total;
            if (amount <= 0 || wallet.Balance < amount)
            {
                throw new InvalidOperationException("Insufficient wallet balance.");
            }

            wallet.Balance -= amount;
            wallet.LifetimeDebit += amount;
            wallet.UpdatedAt = now;
            wallet.Transactions.Add(new WalletTransactionEntity
            {
                Id = $"wtx_{Guid.NewGuid():N}",
                WalletId = wallet.Id,
                Amount = amount,
                Type = "debit",
                Reason = $"Payment for order {id}",
                ReferenceId = id,
                CreatedAt = now
            });
        }

        var order = new OrderEntity
        {
            Id = id,
            UserEmail = normalizedEmail,
            Status = "Processing",
            Date = now,
            Subtotal = subtotal,
            Discount = discount,
            Total = total,
            PaymentMethod = paymentMethod,
            PaymentStatus = paymentStatus,
            ShippingName = request.ShippingAddress.Name,
            ShippingStreet = request.ShippingAddress.Street,
            ShippingCity = request.ShippingAddress.City,
            ShippingState = request.ShippingAddress.State,
            ShippingZip = request.ShippingAddress.Zip,
            ShippingCountry = request.ShippingAddress.Country,
            PromoCode = promoCode,
            Items = request.Items.Select(item => new OrderItemEntity
            {
                Id = $"item_{Guid.NewGuid():N}",
                OrderId = id,
                ProductId = item.Id,
                Name = item.Name,
                Price = item.Price,
                Image = item.Image,
                Quantity = item.Quantity
            }).ToList()
        };

        order.TrackingEvents.Add(CreateTrackingEvent(id, "Processing", now));
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> UpdateStatusAsync(string id, string status, string? note)
    {
        var order = await db.Orders
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id);

        if (order is null)
        {
            return null;
        }

        var normalizedStatus = NormalizeStatus(status);
        order.Status = normalizedStatus;
        order.TrackingEvents.Add(CreateTrackingEvent(id, normalizedStatus, DateTimeOffset.UtcNow, note));
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == id);
        if (order is null)
        {
            return false;
        }

        db.Orders.Remove(order);
        await db.SaveChangesAsync();
        return true;
    }

    private static OrderTrackingEventEntity CreateTrackingEvent(string orderId, string status, DateTimeOffset createdAt, string? note = null)
    {
        var copy = TrackingCopy.TryGetValue(status, out var configuredCopy)
            ? configuredCopy
            : (Title: status, Description: "Order status updated.");
        return new OrderTrackingEventEntity
        {
            Id = $"track_{Guid.NewGuid():N}",
            OrderId = orderId,
            Status = status,
            Title = copy.Title,
            Description = string.IsNullOrWhiteSpace(note) ? copy.Description : note.Trim(),
            CreatedAt = createdAt
        };
    }

    private static string NormalizeStatus(string status)
    {
        var cleaned = status.Trim();
        return TrackingCopy.ContainsKey(cleaned) ? cleaned : "Processing";
    }

    private static string NormalizePaymentMethod(string? paymentMethod)
    {
        return paymentMethod?.Trim().Equals("wallet", StringComparison.OrdinalIgnoreCase) == true
            ? "wallet"
            : "cashOnDelivery";
    }

    private static string? NormalizePromoCode(string? promoCode)
    {
        return string.IsNullOrWhiteSpace(promoCode)
            ? null
            : promoCode.Trim().ToUpperInvariant();
    }

    private static OrderDto ToDto(OrderEntity order)
    {
        return new OrderDto(
            order.Id,
            order.UserEmail,
            order.Date,
            order.Status,
            order.Items.Select(item => new OrderItemDto(item.ProductId, item.Name, item.Price, item.Image, item.Quantity)).ToList(),
            order.Subtotal,
            order.Discount,
            order.Total,
            order.PaymentMethod,
            order.PaymentStatus,
            new ShippingAddressDto(
                order.ShippingName,
                order.ShippingStreet,
                order.ShippingCity,
                order.ShippingState,
                order.ShippingZip,
                order.ShippingCountry),
            order.PromoCode,
            order.TrackingEvents
                .OrderBy(item => item.CreatedAt)
                .Select(item => new OrderTrackingEventDto(item.Id, item.Status, item.Title, item.Description, item.CreatedAt))
                .ToList());
    }
}
