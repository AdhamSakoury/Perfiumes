using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class NotificationService
{
    private readonly object _sync = new();
    private readonly Dictionary<string, List<AppNotification>> _notifications = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<AppNotification> GetForUser(string userEmail)
    {
        lock (_sync)
        {
            EnsureSeed(userEmail);
            return _notifications[userEmail].OrderByDescending(item => item.CreatedAt).ToList();
        }
    }

    public IReadOnlyList<AppNotification> MarkAsRead(string userEmail, string notificationId)
    {
        lock (_sync)
        {
            EnsureSeed(userEmail);
            _notifications[userEmail] = _notifications[userEmail]
                .Select(item => item.Id == notificationId ? item with { IsRead = true } : item)
                .ToList();
            return GetForUser(userEmail);
        }
    }

    public IReadOnlyList<AppNotification> MarkAllAsRead(string userEmail)
    {
        lock (_sync)
        {
            EnsureSeed(userEmail);
            _notifications[userEmail] = _notifications[userEmail]
                .Select(item => item with { IsRead = true })
                .ToList();
            return GetForUser(userEmail);
        }
    }

    public AppNotification Create(string userEmail, string title, string message, string type = "info", string? link = null)
    {
        lock (_sync)
        {
            EnsureSeed(userEmail);

            var notification = new AppNotification(
                Guid.NewGuid().ToString("N"),
                userEmail,
                title,
                message,
                string.IsNullOrWhiteSpace(type) ? "info" : type,
                string.IsNullOrWhiteSpace(link) ? null : link.Trim(),
                false,
                DateTimeOffset.UtcNow);

            _notifications[userEmail].Add(notification);
            return notification;
        }
    }

    private void EnsureSeed(string userEmail)
    {
        if (_notifications.ContainsKey(userEmail))
        {
            return;
        }

        _notifications[userEmail] = [];
    }
}
