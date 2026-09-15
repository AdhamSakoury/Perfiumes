namespace Perfiumes.Api.Data.Entities;

public sealed class OrderMessageEntity
{
    public string Id { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public string SenderRole { get; set; } = string.Empty; // "customer" or "delivery" or "admin"
    public string SenderName { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string MessageType { get; set; } = "text";
    public string? MediaUrl { get; set; }
    public string? FileName { get; set; }
    public string? MediaContentType { get; set; }
    public byte[]? MediaData { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public OrderEntity? Order { get; set; }
}
