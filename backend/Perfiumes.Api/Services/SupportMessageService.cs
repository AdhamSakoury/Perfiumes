using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class SupportMessageService(PerfiumesDbContext db)
{
    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SupportConversations_UserEmail' AND object_id = OBJECT_ID(N'[SupportConversations]'))
    CREATE INDEX [IX_SupportConversations_UserEmail] ON [SupportConversations] ([UserEmail]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SupportConversations_UpdatedAt' AND object_id = OBJECT_ID(N'[SupportConversations]'))
    CREATE INDEX [IX_SupportConversations_UpdatedAt] ON [SupportConversations] ([UpdatedAt]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SupportConversations_Status_UpdatedAt' AND object_id = OBJECT_ID(N'[SupportConversations]'))
    CREATE INDEX [IX_SupportConversations_Status_UpdatedAt] ON [SupportConversations] ([Status], [UpdatedAt]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SupportMessages_ConversationId' AND object_id = OBJECT_ID(N'[SupportMessages]'))
    CREATE INDEX [IX_SupportMessages_ConversationId] ON [SupportMessages] ([ConversationId]);
""");
    }

    public async Task<SupportConversation> CreateAsync(CreateSupportConversationRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var conversationId = $"support_{Guid.NewGuid():N}";
        var conversation = new SupportConversationEntity
        {
            Id = conversationId,
            UserId = Clean(request.UserId, request.UserEmail),
            UserName = Clean(request.UserName, "Customer"),
            UserEmail = Clean(request.UserEmail, "unknown@local").ToLowerInvariant(),
            Subject = Clean(request.Subject, "Chatbot help request"),
            Status = "open",
            CreatedAt = now,
            UpdatedAt = now,
            Messages =
            [
                new SupportMessageEntity
                {
                    Id = $"msg_{Guid.NewGuid():N}",
                    ConversationId = conversationId,
                    SenderRole = "customer",
                    SenderName = Clean(request.UserName, "Customer"),
                    SenderEmail = Clean(request.UserEmail, "unknown@local").ToLowerInvariant(),
                    Body = Clean(request.Message, string.Empty),
                    CreatedAt = now
                }
            ]
        };

        db.SupportConversations.Add(conversation);
        await db.SaveChangesAsync();
        return ToModel(conversation);
    }

    public async Task<IReadOnlyList<SupportConversation>> GetForUserAsync(string userEmail)
    {
        var normalizedEmail = userEmail.Trim().ToLowerInvariant();
        var conversations = await db.SupportConversations
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Messages)
            .Where(item => item.UserEmail == normalizedEmail)
            .OrderByDescending(item => item.UpdatedAt)
            .ToListAsync();

        return conversations.Select(ToModel).ToList();
    }

    public async Task<IReadOnlyList<SupportConversation>> GetAllAsync()
    {
        var conversations = await db.SupportConversations
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Messages)
            .OrderByDescending(item => item.Status == "open")
            .ThenByDescending(item => item.UpdatedAt)
            .ToListAsync();

        return conversations.Select(ToModel).ToList();
    }

    public Task<SupportConversation?> AddCustomerMessageAsync(string conversationId, CreateSupportMessageRequest request)
    {
        return AddMessageAsync(
            conversationId,
            "customer",
            Clean(request.SenderName, "Customer"),
            Clean(request.SenderEmail, "unknown@local"),
            Clean(request.Body, string.Empty),
            "open");
    }

    public Task<SupportConversation?> AddAdminReplyAsync(string conversationId, string adminEmail, string body)
    {
        return AddMessageAsync(conversationId, "admin", "Gnouby Admin", adminEmail, Clean(body, string.Empty), "answered");
    }

    public async Task<SupportConversation?> CloseAsync(string conversationId)
    {
        var current = await db.SupportConversations.Include(item => item.Messages).FirstOrDefaultAsync(item => item.Id == conversationId);
        if (current is null)
        {
            return null;
        }

        current.Status = "closed";
        current.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return ToModel(current);
    }

    private async Task<SupportConversation?> AddMessageAsync(
        string conversationId,
        string senderRole,
        string senderName,
        string senderEmail,
        string body,
        string nextStatus)
    {
        var current = await db.SupportConversations.Include(item => item.Messages).FirstOrDefaultAsync(item => item.Id == conversationId);
        if (string.IsNullOrWhiteSpace(body) || current is null)
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        current.Status = nextStatus;
        current.UpdatedAt = now;
        current.Messages.Add(new SupportMessageEntity
        {
            Id = $"msg_{Guid.NewGuid():N}",
            ConversationId = conversationId,
            SenderRole = senderRole,
            SenderName = senderName,
            SenderEmail = senderEmail.ToLowerInvariant(),
            Body = body,
            CreatedAt = now
        });

        await db.SaveChangesAsync();
        return ToModel(current);
    }

    private static string Clean(string? value, string fallback)
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static SupportConversation ToModel(SupportConversationEntity entity)
    {
        return new SupportConversation(
            entity.Id,
            entity.UserId,
            entity.UserName,
            entity.UserEmail,
            entity.Subject,
            entity.Status,
            entity.CreatedAt,
            entity.UpdatedAt,
            entity.Messages
                .OrderBy(message => message.CreatedAt)
                .Select(message => new SupportMessage(
                    message.Id,
                    message.ConversationId,
                    message.SenderRole,
                    message.SenderName,
                    message.SenderEmail,
                    message.Body,
                    message.CreatedAt))
                .ToList());
    }
}
