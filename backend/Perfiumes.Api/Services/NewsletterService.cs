using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class NewsletterService(PerfiumesDbContext db)
{
    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[NewsletterSubscribers]', N'U') IS NULL
BEGIN
    CREATE TABLE [NewsletterSubscribers] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_NewsletterSubscribers] PRIMARY KEY,
        [Email] nvarchar(256) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [IsActive] bit NOT NULL
    );
    CREATE UNIQUE INDEX [IX_NewsletterSubscribers_Email] ON [NewsletterSubscribers] ([Email]);
END
""");
    }

    public async Task<NewsletterSubscriberDto?> SubscribeAsync(string email)
    {
        var normalized = email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized) || !normalized.Contains('@'))
        {
            return null;
        }

        var existing = await db.NewsletterSubscribers.FirstOrDefaultAsync(item => item.Email == normalized);
        if (existing is not null)
        {
            existing.IsActive = true;
            await db.SaveChangesAsync();
            return ToDto(existing);
        }

        var subscriber = new NewsletterSubscriberEntity
        {
            Id = $"newsletter_{Guid.NewGuid():N}",
            Email = normalized,
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        };

        db.NewsletterSubscribers.Add(subscriber);
        await db.SaveChangesAsync();
        return ToDto(subscriber);
    }

    public async Task<IReadOnlyList<NewsletterSubscriberDto>> GetAllAsync()
    {
        var subscribers = await db.NewsletterSubscribers
            .AsNoTracking()
            .OrderByDescending(item => item.CreatedAt)
            .ToListAsync();

        return subscribers.Select(ToDto).ToList();
    }

    private static NewsletterSubscriberDto ToDto(NewsletterSubscriberEntity subscriber)
    {
        return new NewsletterSubscriberDto(subscriber.Id, subscriber.Email, subscriber.CreatedAt, subscriber.IsActive);
    }
}
