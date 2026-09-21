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

IF COL_LENGTH(N'[SupportMessages]', N'MessageType') IS NULL
    ALTER TABLE [SupportMessages] ADD [MessageType] nvarchar(16) NOT NULL CONSTRAINT [DF_SupportMessages_MessageType] DEFAULT N'text';
IF COL_LENGTH(N'[SupportMessages]', N'MediaUrl') IS NULL
    ALTER TABLE [SupportMessages] ADD [MediaUrl] nvarchar(1000) NULL;
IF COL_LENGTH(N'[SupportMessages]', N'FileName') IS NULL
    ALTER TABLE [SupportMessages] ADD [FileName] nvarchar(255) NULL;
IF COL_LENGTH(N'[SupportMessages]', N'MediaContentType') IS NULL
    ALTER TABLE [SupportMessages] ADD [MediaContentType] nvarchar(128) NULL;
IF COL_LENGTH(N'[SupportMessages]', N'MediaData') IS NULL
    ALTER TABLE [SupportMessages] ADD [MediaData] varbinary(max) NULL;
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
        return await db.SupportConversations
            .AsNoTracking()
            .Where(item => item.UserEmail == normalizedEmail)
            .OrderByDescending(item => item.UpdatedAt)
            .Select(item => new SupportConversation(
                item.Id,
                item.UserId,
                item.UserName,
                item.UserEmail,
                item.Subject,
                item.Status,
                item.CreatedAt,
                item.UpdatedAt,
                item.Messages
                    .OrderBy(message => message.CreatedAt)
                    .Select(message => new SupportMessage(
                        message.Id,
                        message.ConversationId,
                        message.SenderRole,
                        message.SenderName,
                        message.SenderEmail,
                        message.Body,
                        message.CreatedAt,
                        message.MessageType,
                        message.MediaUrl,
                        message.FileName))
                    .ToList()))
            .ToListAsync();
    }

    public async Task<IReadOnlyList<SupportConversation>> GetAllAsync()
    {
        return await db.SupportConversations
            .AsNoTracking()
            .OrderByDescending(item => item.Status == "open")
            .ThenByDescending(item => item.UpdatedAt)
            .Select(item => new SupportConversation(
                item.Id,
                item.UserId,
                item.UserName,
                item.UserEmail,
                item.Subject,
                item.Status,
                item.CreatedAt,
                item.UpdatedAt,
                item.Messages
                    .OrderBy(message => message.CreatedAt)
                    .Select(message => new SupportMessage(
                        message.Id,
                        message.ConversationId,
                        message.SenderRole,
                        message.SenderName,
                        message.SenderEmail,
                        message.Body,
                        message.CreatedAt,
                        message.MessageType,
                        message.MediaUrl,
                        message.FileName))
                    .ToList()))
            .ToListAsync();
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

    public Task<SupportConversation?> AddCustomerAttachmentAsync(
        string conversationId,
        string? senderName,
        string? senderEmail,
        IFormFile file,
        string messageType)
    {
        return AddAttachmentAsync(
            conversationId,
            "customer",
            Clean(senderName, "Customer"),
            Clean(senderEmail, "unknown@local").ToLowerInvariant(),
            file,
            messageType,
            "open");
    }

    public Task<SupportConversation?> AddAdminAttachmentAsync(
        string conversationId,
        string adminEmail,
        IFormFile file,
        string messageType)
    {
        return AddAttachmentAsync(
            conversationId,
            "admin",
            "Gnouby Admin",
            Clean(adminEmail, "admin@perfiumes.local").ToLowerInvariant(),
            file,
            messageType,
            "answered");
    }

    public async Task<SupportConversation?> AddAttachmentAsync(
        string conversationId,
        string senderRole,
        string senderName,
        string senderEmail,
        IFormFile file,
        string messageType,
        string nextStatus)
    {
        if (file.Length <= 0 || file.Length > 15 * 1024 * 1024) throw new InvalidOperationException("File must be between 1 byte and 15 MB.");
        var type = messageType.Trim().ToLowerInvariant();
        var isImage = type == "image";
        var isAudio = type == "audio";
        var isDocument = type == "document";
        if (!isImage && !isAudio && !isDocument) throw new InvalidOperationException("Unsupported media type.");

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension))
        {
            var ct = (file.ContentType ?? string.Empty).ToLowerInvariant();
            extension = ct switch
            {
                "image/jpeg" => ".jpg",
                "image/png" => ".png",
                "image/webp" => ".webp",
                "image/gif" => ".gif",
                "image/heic" => ".heic",
                "audio/webm" => ".webm",
                "audio/ogg" => ".ogg",
                "audio/mp4" or "audio/m4a" => ".m4a",
                "audio/mpeg" or "audio/mp3" => ".mp3",
                "audio/wav" => ".wav",
                "application/pdf" => ".pdf",
                _ => isImage ? ".jpg" : isAudio ? ".webm" : ".bin"
            };
        }

        var allowed = isImage
            ? new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".jfif", ".bmp", ".svg" }
            : isAudio
                ? new[] { ".webm", ".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac", ".opus" }
                : new[] { ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip", ".rar", ".7z" };
        if (!allowed.Contains(extension)) throw new InvalidOperationException("Unsupported file format.");

        var current = await db.SupportConversations.Include(item => item.Messages).FirstOrDefaultAsync(item => item.Id == conversationId);
        if (current is null) return null;

        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer);
        var message = new SupportMessageEntity
        {
            Id = $"msg_{Guid.NewGuid():N}",
            ConversationId = conversationId,
            SenderRole = senderRole,
            SenderName = Clean(senderName, senderRole == "admin" ? "Gnouby Admin" : "Customer"),
            SenderEmail = Clean(senderEmail, "unknown@local").ToLowerInvariant(),
            Body = isImage ? "📷 Image" : isAudio ? "🎤 Voice note" : "📄 Document",
            MessageType = type,
            MediaUrl = $"/api/support-messages/media/{Guid.NewGuid():N}",
            FileName = Path.GetFileName(file.FileName),
            MediaContentType = GetMediaContentType(extension, type),
            MediaData = buffer.ToArray(),
            CreatedAt = DateTimeOffset.UtcNow
        };
        current.Status = nextStatus;
        current.UpdatedAt = message.CreatedAt;
        current.Messages.Add(message);
        await db.SaveChangesAsync();
        return ToModel(current);
    }

    public async Task<(byte[] Data, string ContentType, string FileName)?> GetMediaAsync(string mediaUrl)
    {
        var media = await db.SupportMessages.AsNoTracking()
        .Where(message => message.MediaUrl == mediaUrl && message.MediaData != null)
        .Select(message => new { message.MediaData, message.MediaContentType, message.FileName })
        .FirstOrDefaultAsync();
        return media?.MediaData is null ? null : (media.MediaData, media.MediaContentType ?? "application/octet-stream", media.FileName ?? "media");
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
                    message.CreatedAt,
                    message.MessageType,
                    message.MediaUrl,
                    message.FileName))
                .ToList());
    }

    private static string GetMediaContentType(string extension, string messageType)
    {
        return messageType == "image"
            ? extension switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                _ => "application/octet-stream"
            }
            : messageType == "audio"
            ? extension switch
            {
                ".webm" => "audio/webm",
                ".mp3" => "audio/mpeg",
                ".wav" => "audio/wav",
                ".m4a" => "audio/mp4",
                ".ogg" => "audio/ogg",
                _ => "application/octet-stream"
            }
            : "application/octet-stream";
    }
}
