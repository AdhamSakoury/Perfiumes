namespace Perfiumes.Api.Data.Entities;

public sealed class DeliveryZoneEntity
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string CityRegion { get; set; } = string.Empty;
    public decimal MinFee { get; set; }
    public decimal MaxFee { get; set; }
    public decimal FixedFee { get; set; }
    public decimal DefaultFee { get; set; }
    public string PricingType { get; set; } = "fixed";
    public int EstimatedDays { get; set; } = 3;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<DeliveryZoneAreaEntity> Areas { get; set; } = [];
}
