using Microsoft.AspNetCore.SignalR;

namespace Perfiumes.Api.Hubs;

public sealed class SupportMessageHub : Hub
{
    public const string ConversationCreatedEvent = "supportConversationCreated";
    public const string ConversationUpdatedEvent = "supportConversationUpdated";
    public const string AdminGroup = "support:admins";

    public override async Task OnConnectedAsync()
    {
        var request = Context.GetHttpContext()?.Request;
        var userEmail = request?.Query["userEmail"].ToString();
        var role = request?.Query["role"].ToString();

        if (!string.IsNullOrWhiteSpace(userEmail))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userEmail));
        }

        if (string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AdminGroup);
        }

        await base.OnConnectedAsync();
    }

    public static string UserGroup(string userEmail)
    {
        return $"support:user:{userEmail.Trim().ToLowerInvariant()}";
    }
}
