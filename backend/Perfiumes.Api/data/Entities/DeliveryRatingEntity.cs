namespace Perfiumes.Api.Data.Entities;

public sealed class DeliveryRatingEntity
{
    public string Id { get; set; } = string.Empty;
    public string OrderId { get; set; } = string.Empty;
    public string DeliveryUserId { get; set; } = string.Empty;
    public string UserEmail { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public int Rating { get; set; } // 1 to 5
    public string Comment { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }

    public OrderEntity? Order { get; set; }
    public AppUserEntity? DeliveryUser { get; set; }
}
