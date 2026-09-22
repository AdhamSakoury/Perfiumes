using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/payments/paymob")]
public sealed class PaymentsController(
    PaymobService paymob,
    OrderService orders,
    AdminDashboardService dashboard,
    NotificationService notifications,
    IHubContext<NotificationHub> notificationHub,
    PerfiumesDbContext db,
    AdminAuthService auth,
    IOptions<PaymobOptions> options,
    ILogger<PaymentsController> logger) : ControllerBase
{
    [HttpGet("availability")]
    public IResult Availability() =>
        Results.Ok(new PaymentGatewayAvailability(paymob.IsConfigured, paymob.ConfigurationError));

    [HttpGet("diagnostics")]
    public async Task<IResult> Diagnostics(CancellationToken cancellationToken) =>
        Results.Ok(await paymob.CheckConnectionAsync(cancellationToken));

    [HttpPost("checkout")]
    public async Task<IResult> Checkout(PaymobCheckoutRequest request, CancellationToken cancellationToken)
    {
        if (!paymob.IsConfigured)
            return Results.Problem(paymob.ConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);

        var order = await orders.GetByIdAsync(request.OrderId);
        if (order is null)
            return Results.NotFound(new { message = "Order was not found." });
        if (order.PaymentMethod != "card")
            return Results.BadRequest(new { message = "This order is not configured for card payment." });

        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();
        if (!principal.Email.Equals(order.UserEmail, StringComparison.OrdinalIgnoreCase))
            return Results.Forbid();

        try
        {
            return Results.Ok(await paymob.CreateCheckoutAsync(order, cancellationToken));
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Results.Problem("The payment gateway is taking too long. Please try again in a moment.",
                statusCode: StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Paymob could not be reached for order {OrderId}", order.Id);
            return Results.Problem("Could not reach Paymob checkout. Please try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway);
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning("Paymob checkout could not be created for order {OrderId}: {Message}", order.Id, exception.Message);
            await orders.UpdatePaymentStatusAsync(order.Id, "failed");
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("wallet-top-up")]
    public async Task<IResult> InitiateWalletTopUp(WalletTopUpApiRequest request, CancellationToken cancellationToken)
    {
        if (!paymob.IsConfigured)
            return Results.Problem(paymob.ConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);

        if (request.Amount < 5)
            return Results.BadRequest(new { message = "Minimum top-up amount is 5 EGP." });
        if (request.Amount > 50000)
            return Results.BadRequest(new { message = "Maximum top-up amount is 50,000 EGP." });

        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == principal.Email, cancellationToken);
        if (user is null)
            return Results.Unauthorized();

        var topUp = await dashboard.CreateTopUpRequestAsync(user.Email, request.Amount);
        if (topUp is null)
            return Results.BadRequest(new { message = "Could not initialize wallet top up." });

        try
        {
            var checkout = await paymob.CreateWalletTopUpCheckoutAsync(
                topUp.Id,
                topUp.Amount,
                user.Email,
                user.FullName,
                user.Phone,
                cancellationToken);

            topUp.ClientSecret = checkout.ClientSecret;
            topUp.IntentionId = checkout.IntentionId;
            topUp.IntentionOrderId = checkout.IntentionOrderId;
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new WalletTopUpResponse(
                topUp.Id,
                topUp.Amount,
                topUp.Currency,
                checkout.ClientSecret,
                checkout.CheckoutUrl));
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Results.Problem("The payment gateway is taking too long. Please try again in a moment.",
                statusCode: StatusCodes.Status504GatewayTimeout);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Paymob could not be reached for wallet top-up {TopUpId}", topUp.Id);
            return Results.Problem("Could not reach Paymob checkout. Please try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway);
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning("Paymob checkout could not be created for wallet top-up {TopUpId}: {Message}", topUp.Id, exception.Message);
            await dashboard.FailTopUpAsync(topUp.Id, null);
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpGet("wallet-top-up/{id}")]
    public async Task<IResult> GetWalletTopUpStatus(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        var topUp = await dashboard.GetTopUpRequestByIdAsync(id);
        if (topUp is null)
            return Results.NotFound();

        if (!principal.Email.Equals(topUp.UserEmail, StringComparison.OrdinalIgnoreCase))
            return Results.Forbid();

        return Results.Ok(new WalletTopUpStatusDto(
            topUp.Id,
            topUp.Amount,
            topUp.Currency,
            topUp.Status,
            topUp.PaymentProvider,
            topUp.ProviderTransactionId,
            topUp.CreatedAt,
            topUp.CompletedAt));
    }

    [HttpPost("wallet-top-up/confirm-return")]
    public async Task<IResult> ConfirmWalletTopUpReturn([FromBody] WalletTopUpConfirmRequest? request, CancellationToken cancellationToken)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        var result = await ApplyWalletTopUpConfirmationAsync(principal.Email, request, cancellationToken);
        return Results.Ok(result);
    }

    [HttpPost("wallet-top-up/{id}/confirm")]
    public async Task<IResult> ConfirmWalletTopUp(string id, [FromBody] WalletTopUpConfirmRequest? request, CancellationToken cancellationToken)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
            return Results.Unauthorized();

        var result = await ApplyWalletTopUpConfirmationAsync(
            principal.Email,
            new WalletTopUpConfirmRequest(
                request?.TransactionId,
                id,
                request?.Success,
                request?.AmountCents,
                request?.MerchantOrderId,
                request?.PaymobOrderId,
                request?.Pending),
            cancellationToken);

        if (result.Kind == "unknown")
            return Results.NotFound();

        return Results.Ok(result);
    }

    [HttpPost("webhook")]
    public async Task<IResult> Webhook(CancellationToken cancellationToken)
    {
        var hmacSecret = options.Value.HmacSecret;
        if (string.IsNullOrWhiteSpace(hmacSecret))
            return Results.Problem("Paymob webhook HMAC is not configured.",
                statusCode: StatusCodes.Status503ServiceUnavailable);

        using var document = await JsonDocument.ParseAsync(Request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;
        if (!VerifyHmac(root, Request.Query["hmac"].ToString(), hmacSecret))
            return Results.Unauthorized();

        var orderId = ReadString(root, "merchant_order_id")
            ?? ReadString(root, "special_reference")
            ?? ReadString(root, "order_id")
            ?? ReadString(root, "obj", "order", "merchant_order_id")
            ?? ReadString(root, "obj", "special_reference");
        var success = ReadBool(root, "success")
            ?? ReadBool(root, "is_success")
            ?? ReadBool(root, "obj", "success")
            ?? false;
        var transactionId = ReadString(root, "id") ?? ReadString(root, "obj", "id");
        var amountCents = ReadLong(root, "amount_cents")
            ?? ReadLong(root, "obj", "amount_cents");

        if (string.IsNullOrWhiteSpace(orderId))
            return Results.BadRequest(new { message = "Order reference was not found in Paymob webhook." });

        var existingOrder = await orders.GetByIdAsync(orderId);
        if (existingOrder is null)
        {
            var walletTopUp = await dashboard.GetTopUpRequestByIdAsync(orderId)
                ?? await dashboard.FindTopUpByPaymobRefsAsync(orderId, orderId, orderId, transactionId);
            if (walletTopUp is not null)
            {
                if (success)
                {
                    if (amountCents is > 0)
                    {
                        var expectedCents = (long)Math.Round(walletTopUp.Amount * 100m, MidpointRounding.AwayFromZero);
                        if (amountCents != expectedCents)
                        {
                            logger.LogWarning(
                                "Paymob amount mismatch for wallet top-up {TopUpId}. Expected {Expected} cents, received {Received}.",
                                walletTopUp.Id, expectedCents, amountCents);
                            success = false;
                        }
                    }

                    if (success)
                    {
                        await dashboard.CompleteTopUpAsync(walletTopUp.Id, transactionId);
                        await PublishWalletTopUpNotificationAsync(walletTopUp.UserEmail, walletTopUp.Amount, walletTopUp.Currency);
                    }
                    else
                    {
                        await dashboard.FailTopUpAsync(walletTopUp.Id, transactionId);
                    }
                }
                else
                {
                    await dashboard.FailTopUpAsync(walletTopUp.Id, transactionId);
                }
                return Results.Ok(new { received = true, type = "wallet" });
            }

            return Results.NotFound();
        }

        if (existingOrder.PaymentMethod != "card" || existingOrder.PaymentProvider != "Paymob")
            return Results.BadRequest(new { message = "This callback does not match a Paymob card order." });

        if (success && existingOrder.OnlinePaymentAmount > 0 && amountCents is > 0)
        {
            var expectedCents = (long)Math.Round(existingOrder.OnlinePaymentAmount * 100m, MidpointRounding.AwayFromZero);
            if (amountCents != expectedCents)
            {
                logger.LogWarning(
                    "Paymob amount mismatch for order {OrderId}. Expected {Expected} cents, received {Received}.",
                    orderId, expectedCents, amountCents);
                success = false;
            }
        }

        var order = await orders.UpdatePaymentStatusAsync(orderId, success ? "paid" : "failed", transactionId);
        return order is null ? Results.NotFound() : Results.Ok(new { received = true });
    }

    private async Task<WalletTopUpConfirmResult> ApplyWalletTopUpConfirmationAsync(
        string userEmail,
        WalletTopUpConfirmRequest? request,
        CancellationToken cancellationToken)
    {
        var topUpId = request?.TopUpId;
        var transactionId = request?.TransactionId;
        var successHint = request?.Success;
        var amountCents = request?.AmountCents;
        var merchantOrderId = request?.MerchantOrderId;
        var paymobOrderId = request?.PaymobOrderId;

        PaymobTransactionVerificationResult? verification = null;
        var shouldInquire = successHint != true && !string.IsNullOrWhiteSpace(transactionId);
        if (shouldInquire)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            try
            {
                verification = await paymob.VerifyTransactionAsync(transactionId!, timeout.Token);
                if (!string.IsNullOrWhiteSpace(verification.Error))
                {
                    logger.LogWarning(
                        "Paymob transaction inquiry failed for {TransactionId}: {Error}",
                        transactionId,
                        verification.Error);
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning("Paymob transaction inquiry timed out for {TransactionId}", transactionId);
            }
        }

        WalletTopUpEntity? topUp = null;
        if (!string.IsNullOrWhiteSpace(verification?.SpecialReference))
        {
            topUp = await dashboard.GetTopUpRequestByIdAsync(verification.SpecialReference);
        }

        topUp ??= await dashboard.FindTopUpByPaymobRefsAsync(topUpId, merchantOrderId, paymobOrderId, transactionId);

        var hintedAmount = amountCents is > 0 ? amountCents.Value / 100m : (decimal?)null;
        if (topUp is null && verification is { Success: true, Amount: > 0 })
        {
            topUp = await dashboard.FindPendingTopUpForUserAsync(userEmail, verification.Amount);
        }

        if (topUp is null && successHint == true && hintedAmount is > 0)
        {
            topUp = await dashboard.FindPendingTopUpForUserAsync(userEmail, hintedAmount);
        }

        if (topUp is null && (successHint == true || !string.IsNullOrWhiteSpace(transactionId)))
        {
            topUp = await dashboard.FindPendingTopUpForUserAsync(userEmail);
        }

        if (topUp is null)
        {
            logger.LogWarning("Wallet top-up confirmation could not match a request for {Email}. TopUpId={TopUpId} Txn={Txn}", userEmail, topUpId, transactionId);
            return new WalletTopUpConfirmResult("pending", "unknown", null);
        }

        if (!userEmail.Equals(topUp.UserEmail, StringComparison.OrdinalIgnoreCase))
        {
            return new WalletTopUpConfirmResult("pending", "unknown", null);
        }

        if (topUp.Status == "paid")
        {
            var currentWallet = await dashboard.GetWalletForUserAsync(topUp.UserEmail);
            return new WalletTopUpConfirmResult("paid", "wallet", currentWallet);
        }

        if (successHint == false)
        {
            await dashboard.FailTopUpAsync(topUp.Id, transactionId);
            return new WalletTopUpConfirmResult("failed", "wallet", null);
        }

        var verifiedPaid = verification is { Success: true }
            && (verification.Amount <= 0 || AmountsMatch(topUp.Amount, verification.Amount));
        var redirectPaid = successHint == true
            && request?.Pending != true
            && (hintedAmount is null || AmountsMatch(topUp.Amount, hintedAmount.Value));

        if (verifiedPaid || redirectPaid)
        {
            var completed = await dashboard.CompleteTopUpAsync(topUp.Id, transactionId);
            await PublishWalletTopUpNotificationAsync(topUp.UserEmail, topUp.Amount, topUp.Currency);
            return new WalletTopUpConfirmResult("paid", "wallet", completed?.Wallet);
        }

        if (verification is { Pending: true } || (verification is { Success: false, Error: not null }))
        {
            return new WalletTopUpConfirmResult(topUp.Status, "wallet", null);
        }

        if (verification is { Success: false, Pending: false, Error: null })
        {
            await dashboard.FailTopUpAsync(topUp.Id, transactionId);
            return new WalletTopUpConfirmResult("failed", "wallet", null);
        }

        return new WalletTopUpConfirmResult(topUp.Status, "wallet", null);
    }

    private static bool AmountsMatch(decimal expected, decimal actual)
    {
        var expectedCents = (long)Math.Round(expected * 100m, MidpointRounding.AwayFromZero);
        var actualCents = (long)Math.Round(actual * 100m, MidpointRounding.AwayFromZero);
        return expectedCents == actualCents;
    }

    private async Task PublishWalletTopUpNotificationAsync(string userEmail, decimal amount, string currency)
    {
        try
        {
            var notification = notifications.Create(
                userEmail.Trim().ToLowerInvariant(),
                "Wallet topped up",
                $"{amount:0.##} {currency} was added to your wallet via Paymob Visa.",
                "wallet",
                "/wallet");
            await notificationHub.Clients
                .Group(NotificationHub.GroupName(notification.UserEmail))
                .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not send wallet top-up notification to {Email}", userEmail);
        }
    }

    private static string? ReadString(JsonElement root, params string[] path)
    {
        if (!TryRead(root, out var element, path))
            return null;
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.ToString(),
            _ => null
        };
    }

    private static long? ReadLong(JsonElement root, params string[] path)
    {
        if (!TryRead(root, out var element, path))
            return null;
        return element.ValueKind switch
        {
            JsonValueKind.Number when element.TryGetInt64(out var value) => value,
            JsonValueKind.String when long.TryParse(element.GetString(), out var value) => value,
            _ => null
        };
    }

    private static bool? ReadBool(JsonElement root, params string[] path)
    {
        if (!TryRead(root, out var element, path))
            return null;
        return element.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(element.GetString(), out var value) => value,
            _ => null
        };
    }

    private static bool VerifyHmac(JsonElement root, string received, string secret)
    {
        if (string.IsNullOrWhiteSpace(received))
            return false;
        var fields = new[]
        {
            new[] { "obj", "amount_cents" }, new[] { "obj", "created_at" }, new[] { "obj", "currency" },
            new[] { "obj", "error_occured" }, new[] { "obj", "has_parent_transaction" }, new[] { "obj", "id" },
            new[] { "obj", "integration_id" }, new[] { "obj", "is_3d_secure" }, new[] { "obj", "is_auth" },
            new[] { "obj", "is_capture" }, new[] { "obj", "is_refunded" }, new[] { "obj", "is_standalone_payment" },
            new[] { "obj", "is_voided" }, new[] { "obj", "order", "id" }, new[] { "obj", "owner" },
            new[] { "obj", "pending" }, new[] { "obj", "source_data", "pan" }, new[] { "obj", "source_data", "sub_type" },
            new[] { "obj", "source_data", "type" }, new[] { "obj", "success" }
        };
        var payload = string.Concat(fields.Select(path =>
            TryRead(root, out var element, path) ? element.ToString() : string.Empty));
        try
        {
            var expected = HMACSHA512.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload));
            var actual = Convert.FromHexString(received);
            return actual.Length == expected.Length && CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static bool TryRead(JsonElement root, out JsonElement element, params string[] path)
    {
        element = root;
        foreach (var segment in path)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(segment, out element))
                return false;
        }
        return true;
    }
}
