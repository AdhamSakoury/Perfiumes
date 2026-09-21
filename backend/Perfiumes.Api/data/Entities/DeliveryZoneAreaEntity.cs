namespace Perfiumes.Api.Data.Entities;

public sealed class DeliveryZoneAreaEntity
{
    public string Id { get; set; } = string.Empty;
    public string DeliveryZoneId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal Fee { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DeliveryZoneEntity? Zone { get; set; }
}
