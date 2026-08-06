namespace Perfiumes.Api.Models;

public sealed record AppNotification(
    string Id,
    string UserEmail,
    string Title,
    string Message,
    string Type,
    bool IsRead,
    DateTimeOffset CreatedAt);

public sealed record CreateNotificationRequest(
    string UserEmail,
    string Title,
    string Message,
    string Type = "info");
