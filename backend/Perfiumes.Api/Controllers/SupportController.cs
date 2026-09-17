using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class SupportController(
    SupportMessageService support,
    UserService users,
    NotificationService notifications,
    AdminAuthService auth,
    IHubContext<SupportMessageHub> hub,
    IHubContext<NotificationHub> notificationHub) : ControllerBase
{
    [HttpPost("support/conversations")]
    public async Task<IResult> CreateConversation(CreateSupportConversationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.UserEmail) || string.IsNullOrWhiteSpace(request.Message))
            return Results.BadRequest(new { message = "User email and message are required." });

        var conversation = await support.CreateAsync(request);
        await hub.Clients.Group(SupportMessageHub.AdminGroup)
            .SendAsync(SupportMessageHub.ConversationCreatedEvent, conversation);
        await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail))
            .SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await PublishAdminNotificationAsync("New support message",
            $"{conversation.UserName} sent a new message: {conversation.Subject}", "info", "/admin/messages");
        return Results.Created($"/api/support/conversations/{conversation.Id}", conversation);
    }

    [HttpGet("support/conversations")]
    public async Task<IResult> GetConversations(string userEmail) =>
        Results.Ok(await support.GetForUserAsync(userEmail));

    [HttpPost("support/conversations/{id}/messages")]
    public async Task<IResult> AddMessage(string id, CreateSupportMessageRequest request)
    {
        var conversation = await support.AddCustomerMessageAsync(id, request);
        if (conversation is not null)
        {
            await NotifyConversationAsync(conversation);
            await PublishAdminNotificationAsync("New support message",
                $"{conversation.UserName} replied in {conversation.Subject}.", "info", "/admin/messages");
        }
        return conversation is null ? Results.NotFound() : Results.Ok(conversation);
    }

    [HttpPost("support/conversations/{id}/messages/media")]
    [IgnoreAntiforgeryToken]
    public async Task<IResult> AddAttachment(
        string id,
        [FromForm] IFormFile file,
        [FromForm] string messageType)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null || file is null)
            return Results.Unauthorized();
        try
        {
            var user = await users.GetByEmailAsync(principal.Email);
            var conversation = await support.AddCustomerAttachmentAsync(
                id, user?.FullName ?? principal.Email, principal.Email, file, messageType);
            if (conversation is null)
                return Results.NotFound();
            await NotifyConversationAsync(conversation);
            await PublishAdminNotificationAsync("New support message",
                $"{conversation.UserName} sent a media message.", "info", "/admin/messages");
            return Results.Ok(conversation);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("support-messages/media/{id}")]
    public async Task<IResult> GetMedia(string id)
    {
        var media = await support.GetMediaAsync($"/api/support-messages/media/{id}");
        return media is null
            ? Results.NotFound()
            : Results.File(media.Value.Data, media.Value.ContentType, media.Value.FileName);
    }

    [HttpGet("admin/support/conversations")]
    public async Task<IResult> GetAll() =>
        !auth.IsAuthorized(HttpContext) ? Results.Unauthorized() : Results.Ok(await support.GetAllAsync());

    [HttpPost("admin/support/conversations/{id}/reply")]
    public async Task<IResult> Reply(string id, AdminSupportReplyRequest request)
    {
        var admin = auth.ValidateRequest(HttpContext);
        if (admin?.Role != "admin")
            return Results.Unauthorized();
        var conversation = await support.AddAdminReplyAsync(id, admin.Email, request.Body);
        if (conversation is not null)
        {
            await NotifyConversationAsync(conversation);
            await PublishNotificationAsync(conversation.UserEmail, "Support replied",
                $"Admin replied to {conversation.Subject}.", "info", "/messages");
        }
        return conversation is null ? Results.NotFound() : Results.Ok(conversation);
    }

    [HttpPost("admin/support/conversations/{id}/close")]
    public async Task<IResult> Close(string id)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        var conversation = await support.CloseAsync(id);
        if (conversation is not null)
        {
            await NotifyConversationAsync(conversation);
            await PublishNotificationAsync(conversation.UserEmail, "Support conversation closed",
                $"Your conversation about {conversation.Subject} was closed.", "info", "/messages");
        }
        return conversation is null ? Results.NotFound() : Results.Ok(conversation);
    }

    private async Task NotifyConversationAsync(SupportConversation conversation)
    {
        await hub.Clients.Group(SupportMessageHub.AdminGroup)
            .SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail))
            .SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
    }

    private async Task PublishAdminNotificationAsync(string title, string message, string type, string link)
    {
        var adminEmails = await users.GetAdminEmailsAsync();
        await Task.WhenAll(adminEmails.Select(email => PublishNotificationAsync(email, title, message, type, link)));
    }

    private async Task PublishNotificationAsync(
        string email, string title, string message, string type, string link)
    {
        var notification = notifications.Create(email.Trim().ToLowerInvariant(), title, message, type, link);
        await notificationHub.Clients.Group(NotificationHub.GroupName(notification.UserEmail))
            .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
    }
}
