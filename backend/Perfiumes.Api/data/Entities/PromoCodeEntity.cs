namespace Perfiumes.Api.Data.Entities;

public sealed class PromoCodeEntity
{
    public string Id { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public decimal Discount { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string CreatedByEmail { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}
