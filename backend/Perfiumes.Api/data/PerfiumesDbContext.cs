using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data.Entities;

namespace Perfiumes.Api.Data;

public sealed class PerfiumesDbContext(DbContextOptions<PerfiumesDbContext> options) : DbContext(options)
{
    public DbSet<AppUserEntity> Users => Set<AppUserEntity>();
    public DbSet<ProductEntity> Products => Set<ProductEntity>();
    public DbSet<OrderEntity> Orders => Set<OrderEntity>();
    public DbSet<OrderItemEntity> OrderItems => Set<OrderItemEntity>();
    public DbSet<OrderTrackingEventEntity> OrderTrackingEvents => Set<OrderTrackingEventEntity>();
    public DbSet<SupportConversationEntity> SupportConversations => Set<SupportConversationEntity>();
    public DbSet<SupportMessageEntity> SupportMessages => Set<SupportMessageEntity>();
    public DbSet<UserWalletEntity> UserWallets => Set<UserWalletEntity>();
    public DbSet<WalletTransactionEntity> WalletTransactions => Set<WalletTransactionEntity>();
    public DbSet<PromoCodeEntity> PromoCodes => Set<PromoCodeEntity>();
    public DbSet<NewsletterSubscriberEntity> NewsletterSubscribers => Set<NewsletterSubscriberEntity>();
    public DbSet<OrderMessageEntity> OrderMessages => Set<OrderMessageEntity>();
    public DbSet<ProductReviewEntity> ProductReviews => Set<ProductReviewEntity>();
    public DbSet<DeliveryRatingEntity> DeliveryRatings => Set<DeliveryRatingEntity>();
    public DbSet<CustomerRatingEntity> CustomerRatings => Set<CustomerRatingEntity>();
    public DbSet<AdminExpenseEntity> AdminExpenses => Set<AdminExpenseEntity>();
    public DbSet<WalletTopUpEntity> WalletTopUpRequests => Set<WalletTopUpEntity>();
    public DbSet<DeliveryZoneEntity> DeliveryZones => Set<DeliveryZoneEntity>();
    public DbSet<DeliveryZoneAreaEntity> DeliveryZoneAreas => Set<DeliveryZoneAreaEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUserEntity>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Id).HasMaxLength(64);
            entity.Property(user => user.FullName).HasMaxLength(160);
            entity.Property(user => user.Email).HasMaxLength(256);
            entity.Property(user => user.Role).HasMaxLength(32);
            entity.Property(user => user.AuthProvider).HasMaxLength(32);
            entity.Property(user => user.EmailActivationTokenHash).HasMaxLength(128);
            entity.Property(user => user.ResetPasswordTokenHash).HasMaxLength(128);
            entity.Property(user => user.Phone).HasMaxLength(64);
            entity.Property(user => user.Address).HasMaxLength(500);
            entity.Property(user => user.ProfilePhoto).HasMaxLength(1000);
        });

        modelBuilder.Entity<ProductEntity>(entity =>
        {
            entity.ToTable("Products");
            entity.HasKey(product => product.Id);
            entity.Property(product => product.Id).ValueGeneratedNever();
            entity.Property(product => product.Name).HasMaxLength(220);
            entity.Property(product => product.Brand).HasMaxLength(120);
            entity.Property(product => product.Price).HasPrecision(18, 2);
            entity.Property(product => product.Rating).HasPrecision(3, 1);
            entity.Property(product => product.Gender).HasMaxLength(32);
            entity.Property(product => product.Image).HasMaxLength(1000);
            entity.Property(product => product.Description).HasMaxLength(2000);
            entity.Property(product => product.Category).HasMaxLength(120);
            entity.Property(product => product.NotesJson).HasColumnType("nvarchar(max)");
            entity.Property(product => product.Concentration).HasMaxLength(120);
            entity.Property(product => product.SeasonJson).HasColumnType("nvarchar(max)");
        });

        modelBuilder.Entity<SupportConversationEntity>(entity =>
        {
            entity.ToTable("SupportConversations");
            entity.HasKey(conversation => conversation.Id);
            entity.HasIndex(conversation => conversation.UserEmail);
            entity.HasIndex(conversation => conversation.UpdatedAt);
            entity.HasIndex(conversation => new { conversation.Status, conversation.UpdatedAt });
            entity.Property(conversation => conversation.Id).HasMaxLength(64);
            entity.Property(conversation => conversation.UserId).HasMaxLength(64);
            entity.Property(conversation => conversation.UserName).HasMaxLength(160);
            entity.Property(conversation => conversation.UserEmail).HasMaxLength(256);
            entity.Property(conversation => conversation.Subject).HasMaxLength(220);
            entity.Property(conversation => conversation.Status).HasMaxLength(32);
            entity.HasMany(conversation => conversation.Messages)
                .WithOne(message => message.Conversation)
                .HasForeignKey(message => message.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderEntity>(entity =>
        {
            entity.ToTable("Orders");
            entity.HasKey(order => order.Id);
            entity.HasIndex(order => order.UserEmail);
            entity.HasIndex(order => order.Date);
            entity.HasIndex(order => new { order.Status, order.Date });
            entity.Property(order => order.Id).HasMaxLength(64);
            entity.Property(order => order.ClientRequestId).HasMaxLength(80);
            entity.Property(order => order.UserEmail).HasMaxLength(256);
            entity.Property(order => order.Status).HasMaxLength(32);
            entity.Property(order => order.Subtotal).HasPrecision(18, 2);
            entity.Property(order => order.Discount).HasPrecision(18, 2);
            entity.Property(order => order.ShippingFee).HasPrecision(18, 2);
            entity.Property(order => order.Total).HasPrecision(18, 2);
            entity.Property(order => order.OnlinePaymentAmount).HasPrecision(18, 2);
            entity.Property(order => order.AmountDueAtDelivery).HasPrecision(18, 2);
            entity.Property(order => order.PaymentMethod).HasMaxLength(32);
            entity.Property(order => order.PaymentStatus).HasMaxLength(32);
            entity.Property(order => order.DeliveryZoneId).HasMaxLength(64);
            entity.Property(order => order.DeliveryZoneName).HasMaxLength(160);
            entity.Property(order => order.DeliveryAreaId).HasMaxLength(64);
            entity.Property(order => order.DeliveryAreaName).HasMaxLength(160);
            entity.Property(order => order.PaymentProvider).HasMaxLength(80);
            entity.Property(order => order.PaymentReference).HasMaxLength(120);
            entity.Property(order => order.DeliveryUserId).HasMaxLength(64);
            entity.Property(order => order.DeliveryName).HasMaxLength(160);
            entity.Property(order => order.DeliveryPhone).HasMaxLength(64);
            entity.Property(order => order.CourierName).HasMaxLength(120);
            entity.Property(order => order.TrackingNumber).HasMaxLength(120);
            entity.Property(order => order.ShippingName).HasMaxLength(160);
            entity.Property(order => order.ShippingPhone).HasMaxLength(64);
            entity.Property(order => order.ShippingStreet).HasMaxLength(500);
            entity.Property(order => order.ShippingCity).HasMaxLength(120);
            entity.Property(order => order.ShippingState).HasMaxLength(120);
            entity.Property(order => order.ShippingZip).HasMaxLength(40);
            entity.Property(order => order.ShippingCountry).HasMaxLength(120);
            entity.Property(order => order.PromoCode).HasMaxLength(80);
            entity.HasMany(order => order.Items)
                .WithOne(item => item.Order)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(order => order.TrackingEvents)
                .WithOne(item => item.Order)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(order => order.Messages)
                .WithOne(item => item.Order)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(order => order.ProductReviews)
                .WithOne(item => item.Order)
                .HasForeignKey(item => item.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(order => order.DeliveryRating)
                .WithOne(item => item.Order)
                .HasForeignKey<DeliveryRatingEntity>(item => item.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OrderItemEntity>(entity =>
        {
            entity.ToTable("OrderItems");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasMaxLength(64);
            entity.Property(item => item.OrderId).HasMaxLength(64);
            entity.Property(item => item.Name).HasMaxLength(220);
            entity.Property(item => item.Price).HasPrecision(18, 2);
            entity.Property(item => item.Image).HasMaxLength(1000);
        });

        modelBuilder.Entity<OrderTrackingEventEntity>(entity =>
        {
            entity.ToTable("OrderTrackingEvents");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Id).HasMaxLength(64);
            entity.Property(item => item.OrderId).HasMaxLength(64);
            entity.Property(item => item.Status).HasMaxLength(32);
            entity.Property(item => item.Title).HasMaxLength(160);
            entity.Property(item => item.Description).HasMaxLength(500);
        });

        modelBuilder.Entity<OrderMessageEntity>(entity =>
        {
            entity.ToTable("OrderMessages");
            entity.HasKey(message => message.Id);
            entity.HasIndex(message => new { message.OrderId, message.CreatedAt });
            entity.Property(message => message.Id).HasMaxLength(64);
            entity.Property(message => message.OrderId).HasMaxLength(64);
            entity.Property(message => message.SenderRole).HasMaxLength(32);
            entity.Property(message => message.SenderName).HasMaxLength(160);
            entity.Property(message => message.SenderEmail).HasMaxLength(256);
            entity.Property(message => message.Message).HasMaxLength(2000);
            entity.Property(message => message.MessageType).HasMaxLength(16);
            entity.Property(message => message.MediaUrl).HasMaxLength(1000);
            entity.Property(message => message.FileName).HasMaxLength(255);
            entity.Property(message => message.MediaContentType).HasMaxLength(128);
            entity.Property(message => message.MediaData).HasColumnType("varbinary(max)");
        });

        modelBuilder.Entity<ProductReviewEntity>(entity =>
        {
            entity.ToTable("ProductReviews");
            entity.HasKey(review => review.Id);
            entity.HasIndex(review => review.ProductId);
            entity.HasIndex(review => new { review.OrderId, review.ProductId }).IsUnique();
            entity.Property(review => review.Id).HasMaxLength(64);
            entity.Property(review => review.OrderId).HasMaxLength(64);
            entity.Property(review => review.UserEmail).HasMaxLength(256);
            entity.Property(review => review.UserName).HasMaxLength(160);
            entity.Property(review => review.Comment).HasMaxLength(1000);
            entity.HasOne(review => review.Product)
                .WithMany()
                .HasForeignKey(review => review.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerRatingEntity>(entity =>
        {
            entity.ToTable("CustomerRatings");
            entity.HasKey(rating => rating.Id);
            entity.HasIndex(rating => rating.OrderId).IsUnique();
            entity.HasIndex(rating => rating.DeliveryUserId);
            entity.Property(rating => rating.Id).HasMaxLength(64);
            entity.Property(rating => rating.OrderId).HasMaxLength(64);
            entity.Property(rating => rating.DeliveryUserId).HasMaxLength(64);
            entity.Property(rating => rating.UserEmail).HasMaxLength(256);
            entity.Property(rating => rating.UserName).HasMaxLength(160);
            entity.Property(rating => rating.Comment).HasMaxLength(1000);
            entity.HasOne(rating => rating.Order)
                .WithOne()
                .HasForeignKey<CustomerRatingEntity>(rating => rating.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DeliveryRatingEntity>(entity =>
        {
            entity.ToTable("DeliveryRatings");
            entity.HasKey(rating => rating.Id);
            entity.HasIndex(rating => rating.OrderId).IsUnique();
            entity.HasIndex(rating => rating.DeliveryUserId);
            entity.Property(rating => rating.Id).HasMaxLength(64);
            entity.Property(rating => rating.OrderId).HasMaxLength(64);
            entity.Property(rating => rating.DeliveryUserId).HasMaxLength(64);
            entity.Property(rating => rating.UserEmail).HasMaxLength(256);
            entity.Property(rating => rating.UserName).HasMaxLength(160);
            entity.Property(rating => rating.Comment).HasMaxLength(1000);
            entity.HasOne(rating => rating.DeliveryUser)
                .WithMany()
                .HasForeignKey(rating => rating.DeliveryUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<SupportMessageEntity>(entity =>
        {
            entity.ToTable("SupportMessages");
            entity.HasKey(message => message.Id);
            entity.Property(message => message.Id).HasMaxLength(64);
            entity.Property(message => message.ConversationId).HasMaxLength(64);
            entity.Property(message => message.SenderRole).HasMaxLength(32);
            entity.Property(message => message.SenderName).HasMaxLength(160);
            entity.Property(message => message.SenderEmail).HasMaxLength(256);
            entity.Property(message => message.Body).HasMaxLength(4000);
            entity.Property(message => message.MessageType).HasMaxLength(16);
            entity.Property(message => message.MediaUrl).HasMaxLength(1000);
            entity.Property(message => message.FileName).HasMaxLength(255);
            entity.Property(message => message.MediaContentType).HasMaxLength(128);
            entity.Property(message => message.MediaData).HasColumnType("varbinary(max)");
        });

        modelBuilder.Entity<UserWalletEntity>(entity =>
        {
            entity.ToTable("UserWallets");
            entity.HasKey(wallet => wallet.Id);
            entity.HasIndex(wallet => wallet.UserId).IsUnique();
            entity.HasIndex(wallet => wallet.UserEmail);
            entity.Property(wallet => wallet.Id).HasMaxLength(64);
            entity.Property(wallet => wallet.UserId).HasMaxLength(64);
            entity.Property(wallet => wallet.UserEmail).HasMaxLength(256);
            entity.Property(wallet => wallet.Balance).HasPrecision(18, 2);
            entity.Property(wallet => wallet.LifetimeCredit).HasPrecision(18, 2);
            entity.Property(wallet => wallet.LifetimeDebit).HasPrecision(18, 2);
            entity.Property(wallet => wallet.Currency).HasMaxLength(8);
            entity.HasOne(wallet => wallet.User)
                .WithOne()
                .HasForeignKey<UserWalletEntity>(wallet => wallet.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(wallet => wallet.Transactions)
                .WithOne(transaction => transaction.Wallet)
                .HasForeignKey(transaction => transaction.WalletId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WalletTransactionEntity>(entity =>
        {
            entity.ToTable("WalletTransactions");
            entity.HasKey(transaction => transaction.Id);
            entity.Property(transaction => transaction.Id).HasMaxLength(64);
            entity.Property(transaction => transaction.WalletId).HasMaxLength(64);
            entity.Property(transaction => transaction.Amount).HasPrecision(18, 2);
            entity.Property(transaction => transaction.Type).HasMaxLength(24);
            entity.Property(transaction => transaction.ActorRole).HasMaxLength(24);
            entity.Property(transaction => transaction.Reason).HasMaxLength(260);
            entity.Property(transaction => transaction.ReferenceId).HasMaxLength(120);
        });

        modelBuilder.Entity<PromoCodeEntity>(entity =>
        {
            entity.ToTable("PromoCodes");
            entity.HasKey(promo => promo.Id);
            entity.HasIndex(promo => promo.Code).IsUnique();
            entity.HasIndex(promo => promo.ExpiresAt);
            entity.Property(promo => promo.Id).HasMaxLength(64);
            entity.Property(promo => promo.Code).HasMaxLength(40);
            entity.Property(promo => promo.Discount).HasPrecision(5, 4);
            entity.Property(promo => promo.CreatedByEmail).HasMaxLength(256);
        });

        modelBuilder.Entity<NewsletterSubscriberEntity>(entity =>
        {
            entity.ToTable("NewsletterSubscribers");
            entity.HasKey(subscriber => subscriber.Id);
            entity.HasIndex(subscriber => subscriber.Email).IsUnique();
            entity.Property(subscriber => subscriber.Id).HasMaxLength(64);
            entity.Property(subscriber => subscriber.Email).HasMaxLength(256);
        });

        modelBuilder.Entity<WalletTopUpEntity>(entity =>
        {
            entity.ToTable("WalletTopUpRequests");
            entity.HasKey(t => t.Id);
            entity.HasIndex(t => t.UserEmail);
            entity.HasIndex(t => t.Status);
            entity.Property(t => t.Id).HasMaxLength(64);
            entity.Property(t => t.UserId).HasMaxLength(64);
            entity.Property(t => t.UserEmail).HasMaxLength(256);
            entity.Property(t => t.Amount).HasPrecision(18, 2);
            entity.Property(t => t.Currency).HasMaxLength(8);
            entity.Property(t => t.Status).HasMaxLength(32);
            entity.Property(t => t.PaymentProvider).HasMaxLength(64);
            entity.Property(t => t.ProviderTransactionId).HasMaxLength(128);
            entity.Property(t => t.ClientSecret).HasMaxLength(2000);
            entity.Property(t => t.IntentionId).HasMaxLength(128);
            entity.Property(t => t.IntentionOrderId).HasMaxLength(128);
        });

        modelBuilder.Entity<DeliveryZoneEntity>(entity =>
        {
            entity.ToTable("DeliveryZones");
            entity.HasKey(zone => zone.Id);
            entity.Property(zone => zone.Id).HasMaxLength(64);
            entity.Property(zone => zone.Name).HasMaxLength(160);
            entity.Property(zone => zone.CityRegion).HasMaxLength(160);
            entity.Property(zone => zone.MinFee).HasPrecision(18, 2);
            entity.Property(zone => zone.MaxFee).HasPrecision(18, 2);
            entity.Property(zone => zone.FixedFee).HasPrecision(18, 2);
            entity.Property(zone => zone.DefaultFee).HasPrecision(18, 2);
            entity.Property(zone => zone.PricingType).HasMaxLength(24);
            entity.HasMany(zone => zone.Areas)
                .WithOne(area => area.Zone)
                .HasForeignKey(area => area.DeliveryZoneId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DeliveryZoneAreaEntity>(entity =>
        {
            entity.ToTable("DeliveryZoneAreas");
            entity.HasKey(area => area.Id);
            entity.Property(area => area.Id).HasMaxLength(64);
            entity.Property(area => area.DeliveryZoneId).HasMaxLength(64);
            entity.Property(area => area.Name).HasMaxLength(160);
            entity.Property(area => area.Fee).HasPrecision(18, 2);
        });

        modelBuilder.Entity<AdminExpenseEntity>(entity =>
        {
            entity.ToTable("AdminExpenses");
            entity.HasKey(expense => expense.Id);
            entity.Property(expense => expense.Id).HasMaxLength(64);
            entity.Property(expense => expense.Title).HasMaxLength(220);
            entity.Property(expense => expense.Category).HasMaxLength(80);
            entity.Property(expense => expense.Amount).HasPrecision(18, 2);
            entity.Property(expense => expense.Description).HasMaxLength(2000);
            entity.Property(expense => expense.CreatedByEmail).HasMaxLength(256);
            entity.Property(expense => expense.ReceiptUrl).HasMaxLength(1000);
            entity.HasIndex(expense => expense.Date);
            entity.HasIndex(expense => expense.Category);
        });
    }
}
