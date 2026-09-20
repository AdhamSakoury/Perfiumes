using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class OrdersController(
    OrderService orders,
    UserService users,
    AdminAuthService auth) : ControllerBase
{
    [HttpPut("delivery/orders/{id}/status")]
    public async Task<IResult> UpdateDeliveryStatus(string id, UpdateOrderStatusRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "delivery")
            return Results.Unauthorized();

        try
        {
            var order = await orders.UpdateDeliveryStatusAsync(id, principal.Email, request.Status, request.Note);
            return order is null ? Results.NotFound() : Results.Ok(order);
        }

        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
    }

    [HttpGet("delivery/orders")]
    public async Task<IResult> GetDeliveryOrders()
    {
        var principal = auth.ValidateRequest(HttpContext);
        return principal?.Role != "delivery"
            ? Results.Unauthorized()
            : Results.Ok(await orders.GetForDeliveryAsync(principal.Email));
    }

    [HttpPost("delivery/orders/{id}/location")]
    public async Task<IResult> UpdateDeliveryLocation(string id, UpdateLocationRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "delivery" && principal?.Role != "admin")
            return Results.Unauthorized();

        try
        {
            var order = await orders.UpdateDeliveryLocationAsync(id, principal.Email, request.Latitude, request.Longitude);
            return order is null ? Results.NotFound() : Results.Ok(order);
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("orders/{id}/messages")]
    public async Task<IResult> GetMessages(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        try
        {
            return Results.Ok(await orders.GetOrderMessagesAsync(id, principal.Email, principal.Role));
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("orders/{id}/messages")]
    public async Task<IResult> SendMessage(string id, SendOrderMessageRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Message))
            return Results.BadRequest(new { message = "Message is required." });

        try
        {
            var user = await users.GetByEmailAsync(principal.Email);
            return Results.Ok(await orders.SendOrderMessageAsync(
                id, principal.Email, principal.Role, user?.FullName ?? principal.Email, request.Message));
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("orders/{id}/messages/media")]
    [IgnoreAntiforgeryToken]
    public async Task<IResult> SendAttachment(
        string id,
        [FromForm] IFormFile file,
        [FromForm] string messageType,
        [FromForm] string? senderEmail = null,
        [FromForm] string? senderRole = null,
        [FromForm] string? senderName = null)
    {
        if (file is null)
            return Results.BadRequest(new { message = "File is required." });

        var principal = auth.ValidateRequest(HttpContext);
        var email = principal?.Email ?? senderEmail;
        var role = principal?.Role ?? senderRole ?? "customer";

        if (string.IsNullOrWhiteSpace(email))
            return Results.Unauthorized();

        try
        {
            var user = await users.GetByEmailAsync(email);
            return Results.Ok(await orders.SendOrderAttachmentAsync(
                id, email, role, senderName ?? user?.FullName ?? email, file, messageType));
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("messages/orders")]
    public async Task<IResult> GetConversations()
    {
        var principal = auth.ValidateRequest(HttpContext);
        return principal is null
            ? Results.Unauthorized()
            : Results.Ok(await orders.GetOrderConversationsAsync(principal.Email, principal.Role));
    }

    [HttpGet("order-messages/media/{id}")]
    public async Task<IResult> GetMedia(string id)
    {
        var media = await orders.GetOrderMessageMediaAsync($"/api/order-messages/media/{id}");
        return media is null
            ? Results.NotFound()
            : Results.File(media.Value.Data, media.Value.ContentType, media.Value.FileName);
    }

    [HttpGet("orders/{id}/ratings")]
    public async Task<IResult> GetRatings(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        return principal is null
            ? Results.Unauthorized()
            : Results.Ok(await orders.GetOrderRatingsStatusAsync(id, principal.Email));
    }

    [HttpPost("orders/{id}/product-reviews")]
    public async Task<IResult> CreateProductReview(string id, CreateProductReviewRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "customer")
            return Results.Unauthorized();

        try
        {
            return Results.Ok(await orders.CreateProductReviewAsync(id, principal.Email, request));
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("orders/{id}/delivery-rating")]
    public async Task<IResult> CreateDeliveryRating(string id, CreateDeliveryRatingRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "customer")
            return Results.Unauthorized();

        try
        {
            return Results.Ok(await orders.CreateDeliveryRatingAsync(id, principal.Email, request));
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("delivery/orders/{id}/customer-rating")]
    public async Task<IResult> CreateCustomerRating(string id, CreateCustomerRatingRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "delivery")
            return Results.Unauthorized();

        try
        {
            return Results.Ok(await orders.CreateCustomerRatingAsync(id, principal.Email, request));
        }
        catch (UnauthorizedAccessException)
        {
            return Results.Unauthorized();
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("products/{id:int}/reviews")]
    public async Task<IResult> GetProductReviews(int id) =>
        Results.Ok(await orders.GetProductReviewsAsync(id));
}
