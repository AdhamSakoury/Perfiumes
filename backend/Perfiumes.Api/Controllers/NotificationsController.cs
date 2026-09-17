using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/notifications")]
public sealed class NotificationsController(
    NotificationService notifications,
    IHubContext<NotificationHub> hub) : ControllerBase
{
    [HttpGet]
    public IResult Get(string userEmail) => Results.Ok(notifications.GetForUser(userEmail));

    [HttpPost("{id}/read")]
    public async Task<IResult> MarkRead(string id, string userEmail)
    {
        var items = notifications.MarkAsRead(userEmail, id);
        await hub.Clients.Group(NotificationHub.GroupName(userEmail))
            .SendAsync(NotificationHub.NotificationsUpdatedEvent, items);
        return Results.Ok(items);
    }

    [HttpPost("read-all")]
    public async Task<IResult> MarkAllRead(string userEmail)
    {
        var items = notifications.MarkAllAsRead(userEmail);
        await hub.Clients.Group(NotificationHub.GroupName(userEmail))
            .SendAsync(NotificationHub.NotificationsUpdatedEvent, items);
        return Results.Ok(items);
    }

    [HttpPost]
    public async Task<IResult> Create(CreateNotificationRequest request)
    {
        var notification = notifications.Create(request.UserEmail, request.Title, request.Message, request.Type, request.Link);
        await hub.Clients.Group(NotificationHub.GroupName(request.UserEmail))
            .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
        return Results.Created($"/api/notifications/{notification.Id}", notification);
    }
}
