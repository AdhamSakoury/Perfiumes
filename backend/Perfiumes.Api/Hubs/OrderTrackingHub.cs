using Microsoft.AspNetCore.SignalR;

namespace Perfiumes.Api.Hubs;

public sealed class OrderTrackingHub : Hub
{
    public const string DeliveryLocationUpdatedEvent = "deliveryLocationUpdated";
    public const string OrderMessageReceivedEvent = "orderMessageReceived";
    public const string OrderStatusChangedEvent = "orderStatusChanged";

    public override async Task OnConnectedAsync()
    {
        var orderId = Context.GetHttpContext()?.Request.Query["orderId"].ToString();
        if (!string.IsNullOrWhiteSpace(orderId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, OrderGroup(orderId));
        }

        await base.OnConnectedAsync();
    }

    public async Task JoinOrderGroup(string orderId)
    {
        if (!string.IsNullOrWhiteSpace(orderId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, OrderGroup(orderId));
        }
    }

    public async Task LeaveOrderGroup(string orderId)
    {
        if (!string.IsNullOrWhiteSpace(orderId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, OrderGroup(orderId));
        }
    }

    public static string OrderGroup(string orderId)
    {
        return $"order:{orderId.Trim().ToLowerInvariant()}";
    }
}
