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
            entity.Property(order => order.UserEmail).HasMaxLength(256);
            entity.Property(order => order.Status).HasMaxLength(32);
            entity.Property(order => order.Subtotal).HasPrecision(18, 2);
            entity.Property(order => order.Discount).HasPrecision(18, 2);
            entity.Property(order => order.ShippingFee).HasPrecision(18, 2);
            entity.Property(order => order.Total).HasPrecision(18, 2);
            entity.Property(order => order.PaymentMethod).HasMaxLength(32);
            entity.Property(order => order.PaymentStatus).HasMaxLength(32);
            entity.Property(order => order.PaymentProvider).HasMaxLength(80);
            entity.Property(order => order.PaymentReference).HasMaxLength(120);
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
    }
}
