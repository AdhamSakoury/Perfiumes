using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;
using System.Data;

namespace Perfiumes.Api.Services;

public sealed class OrderService(PerfiumesDbContext db)
{
    private static readonly IReadOnlyDictionary<string, (string Title, string Description)> TrackingCopy =
        new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
        {
            ["Processing"] = ("Order confirmed", "We received your order and started preparing it."),
            ["OnHold"] = ("On hold", "Your order needs a quick review before preparation continues."),
            ["Packed"] = ("Packed", "Your perfumes are packed and ready for courier pickup."),
            ["ReadyForPickup"] = ("Ready for pickup", "Your order is ready for the delivery partner to collect."),
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

IF COL_LENGTH(N'[Orders]', N'ShippingFee') IS NULL
    ALTER TABLE [Orders] ADD [ShippingFee] decimal(18,2) NOT NULL CONSTRAINT [DF_Orders_ShippingFee] DEFAULT 0;

IF COL_LENGTH(N'[Orders]', N'PaymentProvider') IS NULL
    ALTER TABLE [Orders] ADD [PaymentProvider] nvarchar(80) NOT NULL CONSTRAINT [DF_Orders_PaymentProvider] DEFAULT N'';

IF COL_LENGTH(N'[Orders]', N'PaymentReference') IS NULL
    ALTER TABLE [Orders] ADD [PaymentReference] nvarchar(120) NOT NULL CONSTRAINT [DF_Orders_PaymentReference] DEFAULT N'';

IF COL_LENGTH(N'[Orders]', N'DeliveryUserId') IS NULL
    ALTER TABLE [Orders] ADD [DeliveryUserId] nvarchar(64) NULL;

IF COL_LENGTH(N'[Orders]', N'DeliveryName') IS NULL
    ALTER TABLE [Orders] ADD [DeliveryName] nvarchar(160) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_DeliveryUserId_Date' AND object_id = OBJECT_ID(N'[Orders]'))
    CREATE INDEX [IX_Orders_DeliveryUserId_Date] ON [Orders] ([DeliveryUserId], [Date]);

IF COL_LENGTH(N'[Orders]', N'CourierName') IS NULL
    ALTER TABLE [Orders] ADD [CourierName] nvarchar(120) NOT NULL CONSTRAINT [DF_Orders_CourierName] DEFAULT N'';

IF COL_LENGTH(N'[Orders]', N'TrackingNumber') IS NULL
    ALTER TABLE [Orders] ADD [TrackingNumber] nvarchar(120) NOT NULL CONSTRAINT [DF_Orders_TrackingNumber] DEFAULT N'';

IF COL_LENGTH(N'[Orders]', N'EstimatedDelivery') IS NULL
    ALTER TABLE [Orders] ADD [EstimatedDelivery] datetimeoffset NULL;

IF COL_LENGTH(N'[Orders]', N'ShippingPhone') IS NULL
    ALTER TABLE [Orders] ADD [ShippingPhone] nvarchar(64) NOT NULL CONSTRAINT [DF_Orders_ShippingPhone] DEFAULT N'';

IF COL_LENGTH(N'[Orders]', N'ClientRequestId') IS NULL
    ALTER TABLE [Orders] ADD [ClientRequestId] nvarchar(80) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Orders_UserEmail_ClientRequestId' AND object_id = OBJECT_ID(N'[Orders]'))
    EXEC(N'CREATE UNIQUE INDEX [UX_Orders_UserEmail_ClientRequestId] ON [Orders]([UserEmail], [ClientRequestId]) WHERE [ClientRequestId] IS NOT NULL;');
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

    public async Task<IReadOnlyList<OrderDto>> GetForDeliveryAsync(string deliveryEmail)
    {
        var deliveryUser = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(user => user.Email == deliveryEmail.Trim().ToLowerInvariant() && user.Role == "delivery");
        if (deliveryUser is null)
        {
            return [];
        }

        var orders = await db.Orders
            .AsNoTracking()
            .AsSplitQuery()
            .Include(order => order.Items)
            .Include(order => order.TrackingEvents)
            .Where(order => order.DeliveryUserId == deliveryUser.Id)
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
        var clientRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId) ? null : request.ClientRequestId.Trim();

        if (clientRequestId?.Length > 80)
        {
            throw new InvalidOperationException("Invalid payment attempt identifier.");
        }

        if (clientRequestId is not null)
        {
            var existingOrder = await db.Orders
                .AsNoTracking()
                .AsSplitQuery()
                .Include(item => item.Items)
                .Include(item => item.TrackingEvents)
                .FirstOrDefaultAsync(item => item.UserEmail == normalizedEmail && item.ClientRequestId == clientRequestId);
            if (existingOrder is not null)
            {
                return ToDto(existingOrder);
            }
        }

        var customer = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (customer is not null && customer.IsBlocked)
        {
            throw new UnauthorizedAccessException("Your account has been suspended. You cannot place orders.");
        }

        var paymentMethod = NormalizePaymentMethod(request.PaymentMethod);
        var paymentStatus = paymentMethod == "wallet" ? "paid" : "pending";
        var paymentProvider = NormalizePaymentProvider(paymentMethod, request.PaymentProvider);
        var paymentReference = paymentMethod is "wallet" or "card" ? $"PAY-{Guid.NewGuid():N}"[..20].ToUpperInvariant() : string.Empty;
        var shippingFee = CalculateShippingFee(request.ShippingAddress.City);
        var estimatedDelivery = CalculateEstimatedDelivery(request.ShippingAddress.City, now);
        var courierName = SelectCourier(request.ShippingAddress.City);
        var promoCode = NormalizePromoCode(request.PromoCode);

        var requestedQuantities = request.Items
            .GroupBy(item => item.Id)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Quantity));
        var productIds = requestedQuantities.Keys.ToList();
        var products = await db.Products
            .Where(product => productIds.Contains(product.Id))
            .ToDictionaryAsync(product => product.Id);

        foreach (var item in request.Items)
        {
            if (item.Quantity <= 0 || !products.TryGetValue(item.Id, out var product))
            {
                throw new InvalidOperationException($"Product {item.Id} is unavailable.");
            }

            if (product.StockQuantity < requestedQuantities[item.Id])
            {
                throw new InvalidOperationException($"{product.Name} has only {product.StockQuantity} item(s) in stock.");
            }
        }

        var subtotal = request.Items.Sum(item => Math.Round(products[item.Id].Price * item.Quantity, 2));
        var discount = await CalculateDiscountAsync(promoCode, subtotal);
        var total = Math.Round(subtotal - discount + shippingFee, 2);

        if (paymentMethod == "wallet")
        {
            if (string.IsNullOrWhiteSpace(authenticatedEmail)
                || !authenticatedEmail.Trim().Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Wallet payment requires the logged-in customer.");
            }

            // Only the wallet balance is required here. Loading the full transaction
            // history made every wallet checkout slower as that history grew.
            var wallet = await db.UserWallets
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
            db.WalletTransactions.Add(new WalletTransactionEntity
            {
                Id = $"wtx_{Guid.NewGuid():N}",
                WalletId = wallet.Id,
                Amount = amount,
                Type = "debit",
                ActorRole = "customer",
                Reason = $"Payment for order {id}",
                ReferenceId = id,
                CreatedAt = now
            });
        }

        var order = new OrderEntity
        {
            Id = id,
            ClientRequestId = clientRequestId,
            UserEmail = normalizedEmail,
            Status = "Processing",
            Date = now,
            Subtotal = subtotal,
            Discount = discount,
            ShippingFee = shippingFee,
            Total = total,
            PaymentMethod = paymentMethod,
            PaymentStatus = paymentStatus,
            PaymentProvider = paymentProvider,
            PaymentReference = paymentReference,
            CourierName = courierName,
            TrackingNumber = string.Empty,
            EstimatedDelivery = estimatedDelivery,
            ShippingName = request.ShippingAddress.Name,
            ShippingPhone = request.ShippingAddress.Phone,
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
                Name = products[item.Id].Name,
                Price = products[item.Id].Price,
                Image = products[item.Id].Image,
                Quantity = item.Quantity
            }).ToList()
        };

        foreach (var entry in requestedQuantities)
        {
            products[entry.Key].StockQuantity -= entry.Value;
            products[entry.Key].UpdatedAt = now;
        }

        order.TrackingEvents.Add(CreateTrackingEvent(id, "Processing", now));
        db.Orders.Add(order);
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> MarkPaymentStartedAsync(string id, string provider, string reference)
    {
        var order = await db.Orders.FirstOrDefaultAsync(item => item.Id == id);
        if (order is null)
        {
            return null;
        }

        order.PaymentProvider = provider.Trim();
        order.PaymentReference = reference.Trim();
        order.PaymentStatus = "pending";
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> UpdatePaymentStatusAsync(string id, string paymentStatus, string? reference = null)
    {
        var order = await db.Orders
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id);
        if (order is null)
        {
            return null;
        }

        // Payment gateways can redeliver callbacks. Once finalized, never
        // change the result or restore stock again for the same order.
        if (order.PaymentStatus is "paid" or "failed")
        {
            return ToDto(order);
        }

        var normalized = paymentStatus.Trim().Equals("paid", StringComparison.OrdinalIgnoreCase) ? "paid" : "failed";
        order.PaymentStatus = normalized;
        if (!string.IsNullOrWhiteSpace(reference))
        {
            order.PaymentReference = reference.Trim();
        }

        if (normalized == "failed" && order.Status != "Cancelled")
        {
            await RestoreStockAsync(order);
            order.Status = "Cancelled";
            order.TrackingEvents.Add(CreateTrackingEvent(id, "Cancelled", DateTimeOffset.UtcNow, "Payment was not completed."));
        }

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
        var previousStatus = order.Status;
        order.Status = normalizedStatus;
        if (normalizedStatus is "Shipped" or "OutForDelivery" or "Delivered" && string.IsNullOrWhiteSpace(order.TrackingNumber))
        {
            order.CourierName = string.IsNullOrWhiteSpace(order.CourierName) ? SelectCourier(order.ShippingCity) : order.CourierName;
            order.TrackingNumber = $"GN-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():X}";
        }

        if (normalizedStatus == "Cancelled" && previousStatus != "Cancelled")
        {
            await RestoreStockAsync(order);
        }

        order.TrackingEvents.Add(CreateTrackingEvent(id, normalizedStatus, DateTimeOffset.UtcNow, note));
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> CancelByCustomerAsync(string id, string customerEmail)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var normalizedEmail = customerEmail.Trim().ToLowerInvariant();
        var order = await db.Orders
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id && item.UserEmail == normalizedEmail);
        if (order is null)
        {
            return null;
        }

        if (order.Status is not "Processing" and not "OnHold" and not "Packed")
        {
            throw new InvalidOperationException("This order can no longer be cancelled because shipping has started.");
        }

        var refundAmount = order.PaymentStatus == "paid" ? order.Total : 0;
        if (refundAmount > 0)
        {
            var wallet = await db.UserWallets
                .Include(item => item.Transactions)
                .FirstOrDefaultAsync(item => item.UserEmail == normalizedEmail);
            if (wallet is null)
            {
                var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Email == normalizedEmail);
                if (user is null)
                {
                    throw new InvalidOperationException("Customer account was not found.");
                }

                var now = DateTimeOffset.UtcNow;
                wallet = new UserWalletEntity
                {
                    Id = $"wallet_{Guid.NewGuid():N}",
                    UserId = user.Id,
                    UserEmail = user.Email,
                    Currency = "EGP",
                    CreatedAt = now,
                    UpdatedAt = now
                };
                db.UserWallets.Add(wallet);
            }

            wallet.Balance += refundAmount;
            wallet.LifetimeCredit += refundAmount;
            wallet.UpdatedAt = DateTimeOffset.UtcNow;
            wallet.Transactions.Add(new WalletTransactionEntity
            {
                Id = $"wtx_{Guid.NewGuid():N}",
                WalletId = wallet.Id,
                Amount = refundAmount,
                Type = "credit",
                ActorRole = "customer",
                Reason = $"Refund for cancelled order {order.Id}",
                ReferenceId = $"refund_{order.Id}",
                CreatedAt = DateTimeOffset.UtcNow
            });
            order.PaymentStatus = "refunded";
        }

        await RestoreStockAsync(order);
        order.Status = "Cancelled";
        order.TrackingEvents.Add(CreateTrackingEvent(
            order.Id,
            "Cancelled",
            DateTimeOffset.UtcNow,
            refundAmount > 0
                ? $"Your order was cancelled and {refundAmount:0.##} EGP was returned to your wallet."
                : "Your order was cancelled."));

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> AssignDeliveryAsync(string id, string deliveryUserId)
    {
        var deliveryUser = await db.Users.FirstOrDefaultAsync(user => user.Id == deliveryUserId && user.Role == "delivery" && !user.IsBlocked);
        if (deliveryUser is null)
        {
            throw new InvalidOperationException("Delivery account was not found or is blocked.");
        }

        var order = await db.Orders
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id);
        if (order is null)
        {
            return null;
        }

        order.DeliveryUserId = deliveryUser.Id;
        order.DeliveryName = deliveryUser.FullName;
        order.CourierName = deliveryUser.FullName;
        await db.SaveChangesAsync();
        return ToDto(order);
    }

    public async Task<OrderDto?> UpdateDeliveryStatusAsync(string id, string deliveryEmail, string status, string? note)
    {
        var deliveryUser = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(user => user.Email == deliveryEmail.Trim().ToLowerInvariant() && user.Role == "delivery" && !user.IsBlocked);
        if (deliveryUser is null)
        {
            throw new UnauthorizedAccessException("Delivery account is not available.");
        }

        var normalizedStatus = NormalizeStatus(status);
        if (normalizedStatus is not "OutForDelivery" and not "Delivered")
        {
            throw new InvalidOperationException("Delivery staff can only mark an assigned order as out for delivery or delivered.");
        }

        var order = await db.Orders
            .Include(item => item.Items)
            .Include(item => item.TrackingEvents)
            .FirstOrDefaultAsync(item => item.Id == id && item.DeliveryUserId == deliveryUser.Id);
        if (order is null)
        {
            return null;
        }

        order.Status = normalizedStatus;
        if (string.IsNullOrWhiteSpace(order.TrackingNumber))
        {
            order.TrackingNumber = $"GN-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():X}";
        }

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
        var cleaned = paymentMethod?.Trim();
        if (cleaned?.Equals("wallet", StringComparison.OrdinalIgnoreCase) == true) return "wallet";
        if (cleaned?.Equals("card", StringComparison.OrdinalIgnoreCase) == true) return "card";
        if (cleaned?.Equals("instapay", StringComparison.OrdinalIgnoreCase) == true) return "instapay";
        return "cashOnDelivery";
    }

    private static string NormalizePaymentProvider(string paymentMethod, string? paymentProvider)
    {
        if (paymentMethod == "card")
        {
            return "Paymob";
        }

        if (!string.IsNullOrWhiteSpace(paymentProvider))
        {
            return paymentProvider.Trim();
        }

        return paymentMethod switch
        {
            "instapay" => "InstaPay manual confirmation",
            "wallet" => "Gnouby wallet",
            _ => "Cash on delivery"
        };
    }

    private async Task<decimal> CalculateDiscountAsync(string? promoCode, decimal subtotal)
    {
        if (string.IsNullOrWhiteSpace(promoCode) || subtotal <= 0)
        {
            return 0;
        }

        var normalized = promoCode.Trim().ToUpperInvariant();
        var promo = await db.PromoCodes
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Code == normalized && item.IsActive && item.ExpiresAt > DateTimeOffset.UtcNow);

        if (promo is null)
        {
            throw new InvalidOperationException("Invalid or expired promo code.");
        }

        return Math.Round(subtotal * promo.Discount, 2);
    }

    private async Task RestoreStockAsync(OrderEntity order)
    {
        foreach (var item in order.Items)
        {
            var product = await db.Products.FirstOrDefaultAsync(product => product.Id == item.ProductId);
            if (product is not null)
            {
                product.StockQuantity += item.Quantity;
                product.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }
    }

    private static decimal CalculateShippingFee(string city)
    {
        var normalized = city.Trim().ToLowerInvariant();
        if (normalized.Contains("cairo") || normalized.Contains("giza") || normalized.Contains("القاهرة") || normalized.Contains("الجيزة"))
        {
            return 75;
        }

        if (normalized.Contains("alex") || normalized.Contains("alexandria") || normalized.Contains("اسكندرية") || normalized.Contains("الإسكندرية"))
        {
            return 95;
        }

        return 120;
    }

    private static DateTimeOffset CalculateEstimatedDelivery(string city, DateTimeOffset now)
    {
        var normalized = city.Trim().ToLowerInvariant();
        var days = normalized.Contains("cairo") || normalized.Contains("giza") || normalized.Contains("القاهرة") || normalized.Contains("الجيزة")
            ? 2
            : 4;
        return now.AddDays(days);
    }

    private static string SelectCourier(string city)
    {
        var normalized = city.Trim().ToLowerInvariant();
        return normalized.Contains("cairo") || normalized.Contains("giza") || normalized.Contains("القاهرة") || normalized.Contains("الجيزة")
            ? "Gnouby Express"
            : "Gnouby Courier Network";
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
            (order.Items ?? []).Select(item => new OrderItemDto(item.ProductId, item.Name, item.Price, item.Image, item.Quantity)).ToList(),
            order.Subtotal,
            order.Discount,
            order.ShippingFee,
            order.Total,
            order.PaymentMethod,
            order.PaymentStatus,
            order.PaymentProvider,
            order.PaymentReference,
            order.DeliveryUserId,
            order.DeliveryName,
            order.CourierName,
            order.TrackingNumber,
            order.EstimatedDelivery,
            new ShippingAddressDto(
                order.ShippingName,
                order.ShippingStreet,
                order.ShippingCity,
                order.ShippingState,
                order.ShippingZip,
                order.ShippingCountry,
                order.ShippingPhone),
            order.PromoCode,
            (order.TrackingEvents ?? [])
                .OrderBy(item => item.CreatedAt)
                .Select(item => new OrderTrackingEventDto(item.Id, item.Status, item.Title, item.Description, item.CreatedAt))
                .ToList());
    }
}
