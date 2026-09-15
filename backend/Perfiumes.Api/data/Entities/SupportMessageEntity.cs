namespace Perfiumes.Api.Data.Entities;

public sealed class SupportMessageEntity
{
    public string Id { get; set; } = string.Empty;
    public string ConversationId { get; set; } = string.Empty;
    public string SenderRole { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string MessageType { get; set; } = "text";
    public string? MediaUrl { get; set; }
    public string? FileName { get; set; }
    public string? MediaContentType { get; set; }
    public byte[]? MediaData { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public SupportConversationEntity? Conversation { get; set; }
}
