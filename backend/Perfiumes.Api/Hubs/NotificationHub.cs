using Microsoft.AspNetCore.SignalR;

namespace Perfiumes.Api.Hubs;

public sealed class NotificationHub : Hub
{
    public const string NotificationCreatedEvent = "notificationCreated";
    public const string NotificationsUpdatedEvent = "notificationsUpdated";

    public override async Task OnConnectedAsync()
    {
        var userEmail = Context.GetHttpContext()?.Request.Query["userEmail"].ToString();

        if (!string.IsNullOrWhiteSpace(userEmail))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(userEmail));
        }

        await base.OnConnectedAsync();
    }

    public static string GroupName(string userEmail)
    {
        return $"notifications:{userEmail.Trim().ToLowerInvariant()}";
    }
}
