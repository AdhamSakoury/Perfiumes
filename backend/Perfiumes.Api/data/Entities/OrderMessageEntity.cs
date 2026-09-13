namespace Perfiumes.Api.Data.Entities;

public sealed class OrderMessageEntity
{
    public string Id { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public string SenderRole { get; set; } = string.Empty; // "customer" or "delivery" or "admin"
    public string SenderName { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public OrderEntity? Order { get; set; }
}
