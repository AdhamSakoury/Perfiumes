using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/admin")]
public sealed class AdminController(
    OrderService orders,
    UserService users,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    NotificationService notifications,
    IHubContext<NotificationHub> notificationHub,
    IHostEnvironment environment) : ControllerBase
{
    [HttpPut("orders/{id}/status")]
    public async Task<IResult> UpdateOrderStatus(string id, UpdateOrderStatusRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();

        var order = await orders.UpdateStatusAsync(id, request.Status, request.Note);
        if (order is not null)
        {
            await PublishNotificationAsync(order.UserEmail, $"Order {order.Status}",
                $"Your order {order.Id} status changed to {order.Status}.", "order", "/orders");
        }
        return order is null ? Results.NotFound() : Results.Ok(order);
    }

    [HttpPost("orders/{id}/assign-delivery")]
    public async Task<IResult> AssignDelivery(string id, AssignDeliveryRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        try
        {
            var order = await orders.AssignDeliveryAsync(id, request.DeliveryUserId);
            return order is null ? Results.NotFound() : Results.Ok(order);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("orders")]
    public async Task<IResult> GetOrders() =>
        !auth.IsAuthorized(HttpContext) ? Results.Unauthorized() : Results.Ok(await orders.GetAllAsync());

    [HttpDelete("orders/{id}")]
    public async Task<IResult> DeleteOrder(string id)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        return await orders.DeleteAsync(id) ? Results.NoContent() : Results.NotFound();
    }

    [HttpGet("dashboard")]
    public async Task<IResult> GetDashboard() =>
        !auth.IsAuthorized(HttpContext) ? Results.Unauthorized() : Results.Ok(await dashboard.GetSummaryAsync());

    [HttpGet("dashboard/demo")]
    public async Task<IResult> GetDemoDashboard() =>
        environment.IsDevelopment() ? Results.Ok(await dashboard.GetSummaryAsync()) : Results.NotFound();

    [HttpGet("wallets")]
    public async Task<IResult> GetWallets() =>
        !auth.IsAuthorized(HttpContext) ? Results.Unauthorized() : Results.Ok(await dashboard.GetWalletsAsync());

    [HttpGet("wallet-transactions/customer")]
    public async Task<IResult> GetCustomerWalletTransactions() =>
        !auth.IsAuthorized(HttpContext)
            ? Results.Unauthorized()
            : Results.Ok(await dashboard.GetCustomerWalletTransactionsAsync());

    [HttpPost("wallets/{id}/adjust")]
    public async Task<IResult> AdjustWallet(string id, AdjustWalletRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        var wallet = await dashboard.AdjustWalletAsync(id, request);
        return wallet is null
            ? Results.BadRequest(new { message = "Wallet not found or invalid amount." })
            : Results.Ok(wallet);
    }

    [HttpGet("users")]
    public async Task<IResult> GetUsers() =>
        !auth.IsAuthorized(HttpContext) ? Results.Unauthorized() : Results.Ok(await users.GetAdminUsersAsync());

    [HttpPost("deliveries")]
    public async Task<IResult> CreateDelivery(CreateDeliveryUserRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        try
        {
            var deliveryUser = await users.CreateDeliveryUserAsync(request);
            return Results.Created($"/api/admin/users/{deliveryUser.Id}", deliveryUser);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("users/{id}/toggle-block")]
    public async Task<IResult> ToggleBlock(string id, ToggleUserBlockRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        try
        {
            var updated = await users.ToggleUserBlockAsync(id, request.IsBlocked, request.Reason, principal.Email);
            return updated is null ? Results.NotFound(new { message = "User not found" }) : Results.Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("users/{id}/change-password")]
    public async Task<IResult> ChangePassword(string id, ChangeDeliveryPasswordRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        try
        {
            return await users.ChangeDeliveryPasswordAsync(id, request.NewPassword)
                ? Results.NoContent()
                : Results.NotFound(new { message = "Delivery user not found." });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("users/{id}")]
    public async Task<IResult> DeleteUser(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        try
        {
            return await users.DeleteUserAsync(id, principal.Email) ? Results.NoContent() : Results.NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    private async Task PublishNotificationAsync(
        string email, string title, string message, string type, string link)
    {
        if (string.IsNullOrWhiteSpace(email))
            return;
        var notification = notifications.Create(email.Trim().ToLowerInvariant(), title, message, type, link);
        await notificationHub.Clients.Group(NotificationHub.GroupName(notification.UserEmail))
            .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
    }
}
