namespace Perfiumes.Api.Data.Entities;

public sealed class NewsletterSubscriberEntity
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public bool IsActive { get; set; } = true;
}
