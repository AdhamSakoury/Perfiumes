namespace Perfiumes.Api.Models;

public sealed record SupportMessage(
    string Id,
    string ConversationId,
    string SenderRole,
    string SenderName,
    string SenderEmail,
    string Body,
    DateTimeOffset CreatedAt);

public sealed record SupportConversation(
    string Id,
    string UserId,
    string UserName,
    string UserEmail,
    string Subject,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<SupportMessage> Messages);

public sealed record CreateSupportConversationRequest(
    string UserId,
    string UserName,
    string UserEmail,
    string Message,
    string? Subject);

public sealed record CreateSupportMessageRequest(
    string SenderName,
    string SenderEmail,
    string Body);

public sealed record AdminSupportReplyRequest(string Body);
