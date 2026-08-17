namespace Perfiumes.Api.Models;

public sealed record NewsletterSubscribeRequest(string Email);

public sealed record NewsletterSubscriberDto(string Id, string Email, DateTimeOffset CreatedAt, bool IsActive);
