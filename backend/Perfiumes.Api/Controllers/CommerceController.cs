using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class CommerceController(
    OrderService orders,
    AdminDashboardService dashboard,
    PromoCodeService promos,
    NewsletterService newsletter,
    PaymobService paymob,
    AdminAuthService auth,
    NotificationService notifications,
    IHubContext<NotificationHub> notificationHub) : ControllerBase
{
    [HttpGet("orders")]
    public async Task<IResult> GetOrders(string userEmail) =>
        Results.Ok(await orders.GetForUserAsync(userEmail));

    [HttpPost("checkout/quote")]
    public async Task<IResult> QuoteCheckout(CheckoutQuoteRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        try
        {
            return Results.Ok(await orders.QuoteAsync(request));
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpGet("orders/{id}")]
    public async Task<IResult> GetOrder(string id)
    {
        var order = await orders.GetByIdAsync(id);
        return order is null ? Results.NotFound() : Results.Ok(order);
    }

    [HttpPost("orders")]
    public async Task<IResult> CreateOrder(CreateOrderRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.UserEmail) || request.Items.Count == 0)
        {
            return Results.BadRequest(new { message = "User email and order items are required." });
        }

        if (request.PaymentMethod?.Trim().Equals("card", StringComparison.OrdinalIgnoreCase) == true
            && !paymob.IsConfigured)
        {
            return Results.Problem(paymob.ConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
        {
            return Results.Unauthorized();
        }

        if (!principal.Email.Equals(request.UserEmail.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return Results.Forbid();
        }

        try
        {
            var order = await orders.CreateAsync(request, principal.Email);
            return Results.Created($"/api/orders/{order.Id}", order);
        }
        catch (UnauthorizedAccessException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("orders/{id}/cancel")]
    public async Task<IResult> CancelOrder(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "customer")
        {
            return Results.Unauthorized();
        }

        try
        {
            var order = await orders.CancelByCustomerAsync(id, principal.Email);
            if (order is null)
            {
                return Results.NotFound();
            }

            var refunded = order.OnlinePaymentAmount > 0 ? order.OnlinePaymentAmount : order.Total;
            var message = order.PaymentStatus == "refunded"
                ? $"Your order {order.Id} was cancelled and {refunded:0.##} EGP was returned to your wallet."
                : $"Your order {order.Id} was cancelled.";
            await PublishNotificationAsync(order.UserEmail, "Order cancelled", message, "order", "/wallet");
            return Results.Ok(order);
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpGet("wallet")]
    public async Task<IResult> GetWallet()
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
        {
            return Results.Unauthorized();
        }

        var wallet = await dashboard.GetWalletForUserAsync(principal.Email);
        return wallet is null ? Results.NotFound() : Results.Ok(wallet);
    }

    [HttpPost("wallet/top-up")]
    public IResult TopUpWallet(TopUpWalletRequest request)
    {
        return Results.BadRequest(new
        {
            message = "Direct wallet top-up without payment is disabled. Please top up your wallet via Paymob card payment."
        });
    }

    [HttpPost("promos/validate")]
    public async Task<IResult> ValidatePromo(ValidatePromoCodeRequest request)
    {
        var promo = await promos.ValidateAsync(request.Code);
        return promo is null ? Results.NotFound(new { message = "Invalid or expired promo code." }) : Results.Ok(promo);
    }

    [HttpPost("newsletter/subscribe")]
    public async Task<IResult> Subscribe(NewsletterSubscribeRequest request)
    {
        var subscriber = await newsletter.SubscribeAsync(request.Email);
        return subscriber is null ? Results.BadRequest(new { message = "Valid email is required." }) : Results.Ok(subscriber);
    }

    private async Task PublishNotificationAsync(
        string userEmail,
        string title,
        string message,
        string type,
        string link)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
        {
            return;
        }

        var notification = notifications.Create(userEmail.Trim().ToLowerInvariant(), title, message, type, link);
        await notificationHub.Clients
            .Group(NotificationHub.GroupName(notification.UserEmail))
            .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
    }
}
