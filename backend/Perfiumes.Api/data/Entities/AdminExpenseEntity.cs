namespace Perfiumes.Api.Data.Entities;

public class AdminExpenseEntity
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset Date { get; set; }
    public string CreatedByEmail { get; set; } = string.Empty;
    public string? ReceiptUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
