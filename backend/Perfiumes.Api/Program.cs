using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Perfiumes.Api.Data;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200", "http://localhost:4201", "http://127.0.0.1:4201")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? builder.Configuration["Admin:TokenSecret"]
    ?? "replace-this-dev-secret-with-a-long-random-production-secret";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Perfiumes.Api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "Perfiumes.Client";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };

        // A token can remain valid for a few hours. Check the account's current
        // state as well, so blocking a user takes effect immediately instead of
        // waiting for that token to expire.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var email = context.Principal?.FindFirstValue(ClaimTypes.Email)
                    ?? context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Email)
                    ?? context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Sub);

                if (string.IsNullOrWhiteSpace(email))
                {
                    context.Fail("Invalid account token.");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<PerfiumesDbContext>();
                var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Email == email.ToLower());
                if (user is null || user.IsBlocked)
                {
                    context.Fail("This account is blocked.");
                }
            }
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddSignalR();
builder.Services.Configure<PaymobOptions>(builder.Configuration.GetSection("Paymob"));
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.AddDbContext<PerfiumesDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddScoped<ProductRepository>();
builder.Services.AddSingleton<AdminAuthService>();
builder.Services.AddSingleton<ChatbotService>();
builder.Services.AddSingleton<NotificationService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<PasswordService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<SupportMessageService>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<AdminDashboardService>();
builder.Services.AddScoped<PromoCodeService>();
builder.Services.AddScoped<NewsletterService>();
builder.Services.AddHttpClient<GoogleAuthService>();
builder.Services.AddHttpClient<PaymobService>(client =>
{
    // Do not leave checkout waiting indefinitely when the payment gateway is slow.
    client.Timeout = TimeSpan.FromSeconds(8);
})
.ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    PooledConnectionLifetime = TimeSpan.FromMinutes(15),
    PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
    KeepAlivePingDelay = TimeSpan.FromSeconds(30),
    KeepAlivePingTimeout = TimeSpan.FromSeconds(5),
    EnableMultipleHttp2Connections = true
});

var app = builder.Build();

var emailOptions = app.Services.GetRequiredService<IOptions<EmailOptions>>().Value;
var startupLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
var emailConfigured =
    !string.IsNullOrWhiteSpace(emailOptions.SmtpHost)
    && !string.IsNullOrWhiteSpace(emailOptions.Username)
    && !string.IsNullOrWhiteSpace(emailOptions.Password);
if (emailConfigured)
{
    startupLogger.LogInformation(
        "Email SMTP configured for {Username} via {Host}:{Port}. AutoConfirmEmail={AutoConfirm}.",
        emailOptions.Username,
        emailOptions.SmtpHost,
        emailOptions.SmtpPort > 0 ? emailOptions.SmtpPort : 587,
        emailOptions.AutoConfirmEmail);
}
else
{
    startupLogger.LogWarning(
        "Email SMTP is not configured. Set Email:Password via user secrets or environment variables. DevFallbackLinks={DevFallback}.",
        emailOptions.DevFallbackLinks);
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PerfiumesDbContext>();
    await db.Database.EnsureCreatedAsync();
    await scope.ServiceProvider.GetRequiredService<OrderService>().EnsureSchemaAsync();
    await scope.ServiceProvider.GetRequiredService<ProductRepository>().EnsureSeedAsync();
    await scope.ServiceProvider.GetRequiredService<UserService>().EnsureSchemaAsync();
    await scope.ServiceProvider.GetRequiredService<UserService>().SeedAsync(app.Configuration);
    await scope.ServiceProvider.GetRequiredService<SupportMessageService>().EnsureSchemaAsync();
    await scope.ServiceProvider.GetRequiredService<AdminDashboardService>().EnsureSchemaAsync();
    await scope.ServiceProvider.GetRequiredService<PromoCodeService>().EnsureSchemaAsync();
    await scope.ServiceProvider.GetRequiredService<NewsletterService>().EnsureSchemaAsync();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapHub<NotificationHub>("/notificationHub");
app.MapHub<SupportMessageHub>("/supportHub");
app.MapHub<OrderTrackingHub>("/orderTrackingHub");

app.MapGet("/", () => Results.Ok(new
{
    app = "Perfiumes API",
    status = "running",
    endpoints = new[]
    {
        "POST /api/admin/login",
        "POST /api/auth/register",
        "POST /api/auth/resend-confirmation",
        "GET /api/auth/activate",
        "POST /api/auth/login",
        "POST /api/auth/forgot-password",
        "POST /api/auth/reset-password",
        "PUT /api/auth/profile",
        "POST /api/auth/google",
        "GET /api/products",
        "GET /api/products/{id}",
        "GET /api/orders",
        "POST /api/orders",
        "POST /api/orders/{id}/cancel",
        "GET /api/wallet",
        "POST /api/wallet/top-up",
        "PUT /api/admin/orders/{id}/status",
        "GET /api/admin/orders",
        "DELETE /api/admin/orders/{id}",
        "GET /api/admin/dashboard",
        "GET /api/admin/wallets",
        "POST /api/admin/wallets/{id}/adjust",
        "GET /api/admin/users",
        "POST /api/admin/deliveries",
        "POST /api/admin/users/{id}/toggle-block",
        "DELETE /api/admin/users/{id}",
        "POST /api/admin/orders/{id}/assign-delivery",
        "GET /api/delivery/orders",
        "PUT /api/delivery/orders/{id}/status",
        "POST /api/promos/validate",
        "GET /api/admin/promos",
        "POST /api/admin/promos",
        "POST /api/products",
        "PUT /api/products/{id}",
        "DELETE /api/products/{id}",
        "POST /api/chatbot/message",
        "POST /api/support/conversations",
        "GET /api/support/conversations",
        "GET /api/admin/support/conversations",
        "GET /api/notifications",
        "POST /api/notifications/{id}/read",
        "POST /api/notifications/read-all",
        "POST /api/notifications",
        "POST /api/newsletter/subscribe",
        "GET /api/admin/newsletter/subscribers",
        "POST /api/payments/paymob/checkout",
        "POST /api/payments/paymob/webhook",
        "POST /api/payments/status"
    }
}));

async Task PublishNotificationAsync(
    NotificationService notifications,
    IHubContext<NotificationHub> hub,
    string userEmail,
    string title,
    string message,
    string type = "info",
    string? link = null)
{
    if (string.IsNullOrWhiteSpace(userEmail))
    {
        return;
    }

    var notification = notifications.Create(userEmail.Trim().ToLowerInvariant(), title, message, type, link);
    await hub
        .Clients
        .Group(NotificationHub.GroupName(notification.UserEmail))
        .SendAsync(NotificationHub.NotificationCreatedEvent, notification);
}

async Task PublishAdminNotificationAsync(
    UserService users,
    NotificationService notifications,
    IHubContext<NotificationHub> hub,
    string title,
    string message,
    string type = "info",
    string? link = null)
{
    var adminEmails = await users.GetAdminEmailsAsync();
    if (adminEmails.Count == 0)
    {
        return;
    }

    await Task.WhenAll(adminEmails.Select(adminEmail =>
        PublishNotificationAsync(notifications, hub, adminEmail, title, message, type, link)));
}

async Task PublishCustomersNotificationAsync(
    UserService users,
    NotificationService notifications,
    IHubContext<NotificationHub> hub,
    string title,
    string message,
    string type = "info",
    string? link = null)
{
    var customerEmails = await users.GetCustomerEmailsAsync();
    if (customerEmails.Count == 0)
    {
        return;
    }

    await Task.WhenAll(customerEmails.Select(customerEmail =>
        PublishNotificationAsync(notifications, hub, customerEmail, title, message, type, link)));
}

app.MapPost("/api/admin/login", async (AdminLoginRequest request, UserService users) =>
{
    var result = await users.LoginAsync(request.Email, request.Password);
    return result is null || result.User.Role != "admin"
        ? Results.Unauthorized()
        : Results.Ok(new AdminLoginResponse(result.AccessToken, "Bearer", result.ExpiresAt));
});

app.MapPost("/api/auth/register", async (RegisterRequest request, UserService users, PasswordService passwords) =>
{
    if (string.IsNullOrWhiteSpace(request.FullName)
        || string.IsNullOrWhiteSpace(request.Email)
        || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Full name, email and password are required." });
    }

    if (!passwords.MeetsComplexityRequirements(request.Password))
    {
        return Results.BadRequest(new { message = "Password must contain at least 8 characters, uppercase, lowercase, number, and special character." });
    }

    var result = await users.RegisterAsync(request);
    return result is null ? Results.Conflict(new { message = "Email already registered" }) : Results.Ok(result);
});

app.MapPost("/api/auth/resend-confirmation", async (ResendActivationRequest request, UserService users) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest(new { message = "Email is required." });
    }

    return Results.Ok(await users.ResendActivationEmailAsync(request));
});

app.MapPost("/api/auth/login", async (LoginRequest request, UserService users) =>
{
    try
    {
        var result = await users.LoginAsync(request.Email, request.Password);
        return result is null ? Results.Unauthorized() : Results.Ok(result);
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

app.MapGet("/api/auth/activate", async (
    string token,
    UserService users,
    IOptions<EmailOptions> emailOptions) =>
{
    var activated = await users.ActivateEmailAsync(token);
    var frontendOrigin = emailOptions.Value.FrontendBaseUrl.TrimEnd('/');
    var status = activated ? "activated" : "activation-failed";
    return Results.Redirect($"{frontendOrigin}/login?status={status}");
});

app.MapPost("/api/auth/activate", async (ActivateEmailRequest request, UserService users) =>
{
    if (string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.BadRequest(new ActivateEmailResponse(false, "Activation token is required."));
    }

    var activated = await users.ActivateEmailAsync(request.Token);
    return Results.Ok(new ActivateEmailResponse(
        activated,
        activated ? "Your account is activated. You can login now." : "Activation link is invalid or expired."));
});

app.MapGet("/api/auth/email-status", (IOptions<EmailOptions> emailOptions, EmailService emails, IHostEnvironment env) =>
{
    var options = emailOptions.Value;
    var normalizedPassword = options.Password?.Replace(" ", string.Empty).Trim() ?? string.Empty;
    return Results.Ok(new
    {
        configured = emails.IsConfigured,
        passwordConfigured = !string.IsNullOrWhiteSpace(options.Password),
        passwordLength = normalizedPassword.Length,
        environment = env.EnvironmentName,
        userSecretsExpected = env.IsDevelopment(),
        smtpHost = string.IsNullOrWhiteSpace(options.SmtpHost) ? null : options.SmtpHost,
        fromAddress = options.FromAddress,
        username = options.Username,
        autoConfirmEmail = options.AutoConfirmEmail,
        devFallbackLinks = options.DevFallbackLinks
    });
});

app.MapGet("/api/auth/test-email", async (string? to, EmailService emails, IHostEnvironment env) =>
{
    if (!env.IsDevelopment())
    {
        return Results.NotFound();
    }

    var target = string.IsNullOrWhiteSpace(to) ? "test@example.com" : to;
    var sent = await emails.SendActivationEmailAsync(target, "Test User", "http://127.0.0.1:4200/activate?token=test");
    return sent
        ? Results.Ok(new { success = true, message = $"Email sent successfully to {target}" })
        : Results.Problem(
            title: "Failed to send email",
            detail: "SMTP is not configured or authentication failed. Set Email:Username and Email:Password via user secrets.",
            statusCode: 500);
});

app.MapPost("/api/auth/forgot-password", async (
    ForgotPasswordRequest request,
    UserService users) =>
{
    var result = await users.PreparePasswordResetAsync(request);
    return Results.Ok(result);
});

app.MapPost("/api/auth/reset-password", async (ResetPasswordRequest request, UserService users, PasswordService passwords) =>
{
    if (!passwords.MeetsComplexityRequirements(request.NewPassword))
    {
        return Results.BadRequest(new { message = "Password must contain at least 8 characters, uppercase, lowercase, number, and special character." });
    }

    var result = await users.ResetPasswordAsync(request);
    return result is null ? Results.BadRequest(new { message = "Password reset link is invalid or expired." }) : Results.Ok(result);
});

app.MapPut("/api/auth/profile", async (
    UpdateProfileRequest request,
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var result = await users.UpdateProfileAsync(principal.Email, request);
        return result is null ? Results.NotFound() : Results.Ok(result);
    }
    catch (InvalidOperationException exception)
    {
        return Results.Conflict(new { message = exception.Message });
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

app.MapPost("/api/auth/google", async (
    GoogleLoginRequest request,
    GoogleAuthService googleAuth,
    CancellationToken cancellationToken) =>
{
    try
    {
        var result = await googleAuth.LoginAsync(request.Credential, cancellationToken);
        return result is null ? Results.Unauthorized() : Results.Ok(result);
    }
    catch (InvalidOperationException exception)
    {
        return Results.Problem(exception.Message, statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet("/api/products", async (ProductRepository products) =>
{
    return Results.Ok(await products.GetAllAsync());
});

app.MapGet("/api/products/{id:int}", async (int id, ProductRepository products) =>
{
    var product = await products.GetByIdAsync(id);
    return product is null ? Results.NotFound() : Results.Ok(product);
});

app.MapGet("/api/orders", async (string userEmail, OrderService orders) =>
{
    return Results.Ok(await orders.GetForUserAsync(userEmail));
});

app.MapGet("/api/orders/{id}", async (string id, OrderService orders) =>
{
    var order = await orders.GetByIdAsync(id);
    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.MapPost("/api/orders", async (
    CreateOrderRequest request,
    OrderService orders,
    UserService users,
    AdminAuthService auth,
    PaymobService paymob,
    NotificationService notifications,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub) =>
{
    if (string.IsNullOrWhiteSpace(request.UserEmail) || request.Items.Count == 0)
    {
        return Results.BadRequest(new { message = "User email and order items are required." });
    }

    if (request.PaymentMethod?.Trim().Equals("card", StringComparison.OrdinalIgnoreCase) == true && !paymob.IsConfigured)
    {
        return Results.Problem(paymob.ConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    if (!principal.Email.Equals(request.UserEmail.Trim(), StringComparison.OrdinalIgnoreCase))
    {
        return Results.Forbid();
    }

    OrderDto order;
    try
    {
        order = await orders.CreateAsync(request, principal.Email);
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }

    _ = Task.Run(async () =>
    {
        try
        {
            await PublishNotificationAsync(
                notifications,
                notificationHub,
                order.UserEmail,
                "Order placed",
                order.PaymentMethod == "wallet"
                    ? $"Your order {order.Id} was paid from your wallet and is now processing."
                    : $"Your order {order.Id} was received and is now processing.",
                "order",
                "/orders");

            using var scope = app.Services.CreateScope();
            var scopeUsers = scope.ServiceProvider.GetRequiredService<UserService>();
            await PublishAdminNotificationAsync(
                scopeUsers,
                notifications,
                notificationHub,
                "New order",
                $"{order.UserEmail} placed order {order.Id} for {order.Total:0.##} EGP via {order.PaymentMethod}.",
                "order",
                "/admin/orders");
        }
        catch
        {
            // Background notification task failure shouldn't crash or delay order flow
        }
    });

    return Results.Created($"/api/orders/{order.Id}", order);
});

app.MapPost("/api/orders/{id}/cancel", async (
    string id,
    OrderService orders,
    AdminAuthService auth,
    NotificationService notifications,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub) =>
{
    var principal = auth.ValidateRequest(context);
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

        var message = order.PaymentStatus == "refunded"
            ? $"Your order {order.Id} was cancelled and {order.Total:0.##} EGP was returned to your wallet."
            : $"Your order {order.Id} was cancelled.";
        await PublishNotificationAsync(notifications, notificationHub, order.UserEmail, "Order cancelled", message, "order", "/wallet");
        return Results.Ok(order);
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

app.MapGet("/api/wallet", async (
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    var wallet = await dashboard.GetWalletForUserAsync(principal.Email);
    return wallet is null ? Results.NotFound() : Results.Ok(wallet);
});

app.MapPost("/api/wallet/top-up", async (
    TopUpWalletRequest request,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    NotificationService notifications,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    var wallet = await dashboard.TopUpWalletForUserAsync(principal.Email, request);
    if (wallet is null)
    {
        return Results.BadRequest(new { message = "Invalid wallet top up amount." });
    }

    await PublishNotificationAsync(
        notifications,
        notificationHub,
        principal.Email,
        "Wallet topped up",
        $"{request.Amount:0.##} {wallet.Currency} was added to your wallet.",
        "wallet",
        "/wallet");

    return Results.Ok(wallet);
});

app.MapPost("/api/promos/validate", async (
    ValidatePromoCodeRequest request,
    PromoCodeService promos) =>
{
    var promo = await promos.ValidateAsync(request.Code);
    return promo is null ? Results.NotFound(new { message = "Invalid or expired promo code." }) : Results.Ok(promo);
});

app.MapPost("/api/newsletter/subscribe", async (
    NewsletterSubscribeRequest request,
    NewsletterService newsletter) =>
{
    var subscriber = await newsletter.SubscribeAsync(request.Email);
    return subscriber is null ? Results.BadRequest(new { message = "Valid email is required." }) : Results.Ok(subscriber);
});

app.MapGet("/api/payments/paymob/availability", (PaymobService paymob) =>
    Results.Ok(new PaymentGatewayAvailability(paymob.IsConfigured, paymob.ConfigurationError)));

app.MapGet("/api/payments/paymob/diagnostics", async (PaymobService paymob, CancellationToken cancellationToken) =>
    Results.Ok(await paymob.CheckConnectionAsync(cancellationToken)));

app.MapPost("/api/payments/paymob/checkout", async (
    PaymobCheckoutRequest request,
    OrderService orders,
    PaymobService paymob,
    AdminAuthService auth,
    HttpContext context,
    CancellationToken cancellationToken) =>
{
    if (!paymob.IsConfigured)
    {
        return Results.Problem(paymob.ConfigurationError, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    var order = await orders.GetByIdAsync(request.OrderId);
    if (order is null)
    {
        return Results.NotFound(new { message = "Order was not found." });
    }

    if (order.PaymentMethod != "card")
    {
        return Results.BadRequest(new { message = "This order is not configured for card payment." });
    }

    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    if (!principal.Email.Equals(order.UserEmail, StringComparison.OrdinalIgnoreCase))
    {
        return Results.Forbid();
    }

    try
    {
        var checkout = await paymob.CreateCheckoutAsync(order, cancellationToken);
        return Results.Ok(checkout);
    }

    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
    {
        return Results.Problem(
            "The payment gateway is taking too long. Please try again in a moment.",
            statusCode: StatusCodes.Status504GatewayTimeout);
    }
    catch (HttpRequestException exception)
    {
        app.Logger.LogWarning(exception, "Paymob could not be reached for order {OrderId}", order.Id);
        return Results.Problem(
            "Could not reach Paymob checkout. Please try again in a moment.",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (InvalidOperationException exception)
    {
        app.Logger.LogWarning("Paymob checkout could not be created for order {OrderId}: {Message}", order.Id, exception.Message);
        await orders.UpdatePaymentStatusAsync(order.Id, "failed");
        return Results.BadRequest(new { message = exception.Message });
    }
});

app.MapPost("/api/payments/paymob/webhook", async (
    HttpRequest request,
    OrderService orders,
    IOptions<PaymobOptions> paymobOptions) =>
{
    var hmacSecret = paymobOptions.Value.HmacSecret;
    if (string.IsNullOrWhiteSpace(hmacSecret))
    {
        return Results.Problem("Paymob webhook HMAC is not configured.", statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    using var document = await JsonDocument.ParseAsync(request.Body);
    var root = document.RootElement;
    var receivedHmac = request.Query["hmac"].ToString();
    if (!VerifyPaymobWebhookHmac(root, receivedHmac, hmacSecret))
    {
        return Results.Unauthorized();
    }
    var orderId = TryReadString(root, "merchant_order_id")
        ?? TryReadString(root, "special_reference")
        ?? TryReadString(root, "order_id")
        ?? TryReadString(root, "obj", "order", "merchant_order_id")
        ?? TryReadString(root, "obj", "special_reference");
    var success = TryReadBool(root, "success")
        ?? TryReadBool(root, "is_success")
        ?? TryReadBool(root, "obj", "success")
        ?? false;
    var transactionId = TryReadString(root, "id") ?? TryReadString(root, "obj", "id");

    if (string.IsNullOrWhiteSpace(orderId))
    {
        return Results.BadRequest(new { message = "Order reference was not found in Paymob webhook." });
    }

    var existingOrder = await orders.GetByIdAsync(orderId);
    if (existingOrder is null)
    {
        return Results.NotFound();
    }

    if (existingOrder.PaymentMethod != "card" || existingOrder.PaymentProvider != "Paymob")
    {
        return Results.BadRequest(new { message = "This callback does not match a Paymob card order." });
    }

    var order = await orders.UpdatePaymentStatusAsync(orderId, success ? "paid" : "failed", transactionId);
    return order is null ? Results.NotFound() : Results.Ok(new { received = true });
});

static string? TryReadString(JsonElement root, params string[] path)
{
    if (!TryReadElement(root, out var element, path))
    {
        return null;
    }

    return element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.ToString(),
        _ => null
    };
}

static bool VerifyPaymobWebhookHmac(JsonElement root, string receivedHmac, string hmacSecret)
{
    if (string.IsNullOrWhiteSpace(receivedHmac))
    {
        return false;
    }

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

    var payload = string.Concat(fields.Select(path => TryReadElement(root, out var element, path) ? element.ToString() : string.Empty));
    try
    {
        var expectedBytes = HMACSHA512.HashData(Encoding.UTF8.GetBytes(hmacSecret), Encoding.UTF8.GetBytes(payload));
        var receivedBytes = Convert.FromHexString(receivedHmac);
        return receivedBytes.Length == expectedBytes.Length && CryptographicOperations.FixedTimeEquals(receivedBytes, expectedBytes);
    }
    catch (FormatException)
    {
        return false;
    }
}

static bool? TryReadBool(JsonElement root, params string[] path)
{
    if (!TryReadElement(root, out var element, path))
    {
        return null;
    }

    return element.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.String when bool.TryParse(element.GetString(), out var value) => value,
        _ => null
    };
}

static bool TryReadElement(JsonElement root, out JsonElement element, params string[] path)
{
    element = root;
    foreach (var segment in path)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(segment, out element))
        {
            return false;
        }
    }

    return true;
}

app.MapGet("/api/admin/newsletter/subscribers", async (
    NewsletterService newsletter,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await newsletter.GetAllAsync());
});

app.MapGet("/api/admin/promos", async (
    PromoCodeService promos,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await promos.GetAllAsync());
});

app.MapPost("/api/admin/promos", async (
    CreatePromoCodeRequest request,
    PromoCodeService promos,
    AdminAuthService auth,
    IServiceScopeFactory serviceScopeFactory,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub,
    ILoggerFactory loggerFactory) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    PromoCodeDto promo;
    try
    {
        promo = await promos.CreateAsync(request, principal.Email);
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }

    _ = Task.Run(async () =>
    {
        try
        {
            using var scope = serviceScopeFactory.CreateScope();
            var scopedUsers = scope.ServiceProvider.GetRequiredService<UserService>();
            var scopedNotifications = scope.ServiceProvider.GetRequiredService<NotificationService>();
            await PublishCustomersNotificationAsync(
                scopedUsers,
                scopedNotifications,
                notificationHub,
                "New promo code",
                $"Use {promo.Code} for {promo.DiscountPercent:0.##}% off before {promo.ExpiresAt:MMM d, yyyy h:mm tt}.",
                "promo",
                "/cart");
        }
        catch (Exception exception)
        {
            loggerFactory.CreateLogger("PromoNotifications").LogError(exception, "Could not publish promo notifications.");
        }
    });

    return Results.Created($"/api/admin/promos/{promo.Id}", promo);
});

app.MapPut("/api/admin/orders/{id}/status", async (
    string id,
    UpdateOrderStatusRequest request,
    OrderService orders,
    NotificationService notifications,
    AdminAuthService auth,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var order = await orders.UpdateStatusAsync(id, request.Status, request.Note);
    if (order is not null)
    {
        await PublishNotificationAsync(
            notifications,
            notificationHub,
            order.UserEmail,
            $"Order {order.Status}",
            $"Your order {order.Id} status changed to {order.Status}.",
            "order",
            "/orders");
    }

    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.MapPost("/api/admin/orders/{id}/assign-delivery", async (
    string id,
    AssignDeliveryRequest request,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    try
    {
        var order = await orders.AssignDeliveryAsync(id, request.DeliveryUserId);
        return order is null ? Results.NotFound() : Results.Ok(order);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapGet("/api/admin/orders", async (
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await orders.GetAllAsync());
});

app.MapGet("/api/delivery/orders", async (
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "delivery")
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await orders.GetForDeliveryAsync(principal.Email));
});

app.MapPut("/api/delivery/orders/{id}/status", async (
    string id,
    UpdateOrderStatusRequest request,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "delivery")
    {
        return Results.Unauthorized();
    }

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
});

app.MapDelete("/api/admin/orders/{id}", async (
    string id,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return await orders.DeleteAsync(id) ? Results.NoContent() : Results.NotFound();
});
app.MapPost("/api/delivery/orders/{id}/location", async (
    string id,
    UpdateLocationRequest request,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "delivery" && principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

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
});

app.MapGet("/api/orders/{id}/messages", async (
    string id,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    try
    {
        var messages = await orders.GetOrderMessagesAsync(id, principal.Email, principal.Role);
        return Results.Ok(messages);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/orders/{id}/messages", async (
    string id,
    SendOrderMessageRequest request,
    OrderService orders,
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new { message = "Message is required." });
    }

    try
    {
        var user = await users.GetByEmailAsync(principal.Email);
        var senderName = user?.FullName ?? principal.Email;
        var message = await orders.SendOrderMessageAsync(id, principal.Email, principal.Role, senderName, request.Message);
        return Results.Ok(message);
    }
    catch (UnauthorizedAccessException)
    {
        return Results.Unauthorized();
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapGet("/api/orders/{id}/ratings", async (
    string id,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal is null)
    {
        return Results.Unauthorized();
    }

    var status = await orders.GetOrderRatingsStatusAsync(id, principal.Email);
    return Results.Ok(status);
});

app.MapPost("/api/orders/{id}/product-reviews", async (
    string id,
    CreateProductReviewRequest request,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "customer")
    {
        return Results.Unauthorized();
    }

    try
    {
        var review = await orders.CreateProductReviewAsync(id, principal.Email, request);
        return Results.Ok(review);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/orders/{id}/delivery-rating", async (
    string id,
    CreateDeliveryRatingRequest request,
    OrderService orders,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "customer")
    {
        return Results.Unauthorized();
    }

    try
    {
        var rating = await orders.CreateDeliveryRatingAsync(id, principal.Email, request);
        return Results.Ok(rating);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapGet("/api/products/{id:int}/reviews", async (
    int id,
    OrderService orders) =>
{
    var reviews = await orders.GetProductReviewsAsync(id);
    return Results.Ok(reviews);
});

app.MapGet("/api/admin/dashboard", async (
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await dashboard.GetSummaryAsync());
});

app.MapGet("/api/admin/dashboard/demo", async (
    AdminDashboardService dashboard,
    IHostEnvironment environment) =>
{
    return environment.IsDevelopment()
        ? Results.Ok(await dashboard.GetSummaryAsync())
        : Results.NotFound();
});

app.MapGet("/api/admin/wallets", async (
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await dashboard.GetWalletsAsync());
});

app.MapGet("/api/admin/wallet-transactions/customer", async (
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await dashboard.GetCustomerWalletTransactionsAsync());
});

app.MapPost("/api/admin/wallets/{id}/adjust", async (
    string id,
    AdjustWalletRequest request,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var wallet = await dashboard.AdjustWalletAsync(id, request);
    return wallet is null ? Results.BadRequest(new { message = "Wallet not found or invalid amount." }) : Results.Ok(wallet);
});

app.MapGet("/api/admin/users", async (
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var list = await users.GetAdminUsersAsync();
    return Results.Ok(list);
});

app.MapPost("/api/admin/deliveries", async (
    CreateDeliveryUserRequest request,
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    try
    {
        var deliveryUser = await users.CreateDeliveryUserAsync(request);
        return Results.Created($"/api/admin/users/{deliveryUser.Id}", deliveryUser);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/admin/users/{id}/toggle-block", async (
    string id,
    ToggleUserBlockRequest request,
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    try
    {
        var updated = await users.ToggleUserBlockAsync(id, request.IsBlocked, request.Reason, principal.Email);
        return updated is null ? Results.NotFound(new { message = "User not found" }) : Results.Ok(updated);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapDelete("/api/admin/users/{id}", async (
    string id,
    UserService users,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    try
    {
        return await users.DeleteUserAsync(id, principal.Email) ? Results.NoContent() : Results.NotFound();
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { message = ex.Message });
    }
});

app.MapPost("/api/products", async (
    ProductCreateRequest request,
    ProductRepository products,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var product = await products.CreateAsync(request);
    return Results.Created($"/api/products/{product.Id}", product);
});

app.MapPut("/api/products/{id:int}", async (
    int id,
    ProductUpdateRequest request,
    ProductRepository products,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var product = await products.UpdateAsync(id, request);
    return product is null ? Results.NotFound() : Results.Ok(product);
});

app.MapDelete("/api/products/{id:int}", async (
    int id,
    ProductRepository products,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return await products.DeleteAsync(id) ? Results.NoContent() : Results.NotFound();
});

app.MapPost("/api/chatbot/message", async (
    ChatbotMessageRequest request,
    ProductRepository products,
    ChatbotService chatbot) =>
{
    var response = await chatbot.ReplyAsync(request, await products.GetAllAsync());
    return Results.Ok(response);
});

app.MapPost("/api/support/conversations", async (
    CreateSupportConversationRequest request,
    SupportMessageService support,
    UserService users,
    NotificationService notifications,
    IHubContext<SupportMessageHub> hub,
    IHubContext<NotificationHub> notificationHub) =>
{
    if (string.IsNullOrWhiteSpace(request.UserEmail) || string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new { message = "User email and message are required." });
    }

    var conversation = await support.CreateAsync(request);
    await hub.Clients.Group(SupportMessageHub.AdminGroup).SendAsync(SupportMessageHub.ConversationCreatedEvent, conversation);
    await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail)).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
    await PublishAdminNotificationAsync(
        users,
        notifications,
        notificationHub,
        "New support message",
        $"{conversation.UserName} sent a new message: {conversation.Subject}",
        "info",
        "/admin/messages");

    return Results.Created($"/api/support/conversations/{conversation.Id}", conversation);
});

app.MapGet("/api/support/conversations", async (string userEmail, SupportMessageService support) =>
{
    return Results.Ok(await support.GetForUserAsync(userEmail));
});

app.MapPost("/api/support/conversations/{id}/messages", async (
    string id,
    CreateSupportMessageRequest request,
    SupportMessageService support,
    UserService users,
    NotificationService notifications,
    IHubContext<SupportMessageHub> hub,
    IHubContext<NotificationHub> notificationHub) =>
{
    var conversation = await support.AddCustomerMessageAsync(id, request);
    if (conversation is not null)
    {
        await hub.Clients.Group(SupportMessageHub.AdminGroup).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail)).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await PublishAdminNotificationAsync(
            users,
            notifications,
            notificationHub,
            "New support message",
            $"{conversation.UserName} replied in {conversation.Subject}.",
            "info",
            "/admin/messages");
    }

    return conversation is null ? Results.NotFound() : Results.Ok(conversation);
});

app.MapGet("/api/admin/support/conversations", async (
    SupportMessageService support,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await support.GetAllAsync());
});

app.MapPost("/api/admin/support/conversations/{id}/reply", async (
    string id,
    AdminSupportReplyRequest request,
    SupportMessageService support,
    AdminAuthService auth,
    HttpContext context,
    NotificationService notifications,
    IHubContext<SupportMessageHub> hub,
    IHubContext<NotificationHub> notificationHub) =>
{
    var admin = auth.ValidateRequest(context);
    if (admin?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    var conversation = await support.AddAdminReplyAsync(id, admin.Email, request.Body);
    if (conversation is not null)
    {
        await hub.Clients.Group(SupportMessageHub.AdminGroup).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail)).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await PublishNotificationAsync(
            notifications,
            notificationHub,
            conversation.UserEmail,
            "Support replied",
            $"Admin replied to {conversation.Subject}.",
            "info",
            "/messages");
    }

    return conversation is null ? Results.NotFound() : Results.Ok(conversation);
});

app.MapPost("/api/admin/support/conversations/{id}/close", async (
    string id,
    SupportMessageService support,
    AdminAuthService auth,
    HttpContext context,
    NotificationService notifications,
    IHubContext<SupportMessageHub> hub,
    IHubContext<NotificationHub> notificationHub) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var conversation = await support.CloseAsync(id);
    if (conversation is not null)
    {
        await hub.Clients.Group(SupportMessageHub.AdminGroup).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await hub.Clients.Group(SupportMessageHub.UserGroup(conversation.UserEmail)).SendAsync(SupportMessageHub.ConversationUpdatedEvent, conversation);
        await PublishNotificationAsync(
            notifications,
            notificationHub,
            conversation.UserEmail,
            "Support conversation closed",
            $"Your conversation about {conversation.Subject} was closed.",
            "info",
            "/messages");
    }

    return conversation is null ? Results.NotFound() : Results.Ok(conversation);
});

app.MapGet("/api/notifications", (string userEmail, NotificationService notifications) =>
{
    return Results.Ok(notifications.GetForUser(userEmail));
});

app.MapPost("/api/notifications/{id}/read", async (
    string id,
    string userEmail,
    NotificationService notifications,
    IHubContext<NotificationHub> hub) =>
{
    var items = notifications.MarkAsRead(userEmail, id);
    await hub
        .Clients
        .Group(NotificationHub.GroupName(userEmail))
        .SendAsync(NotificationHub.NotificationsUpdatedEvent, items);

    return Results.Ok(items);
});

app.MapPost("/api/notifications/read-all", async (
    string userEmail,
    NotificationService notifications,
    IHubContext<NotificationHub> hub) =>
{
    var items = notifications.MarkAllAsRead(userEmail);
    await hub
        .Clients
        .Group(NotificationHub.GroupName(userEmail))
        .SendAsync(NotificationHub.NotificationsUpdatedEvent, items);

    return Results.Ok(items);
});

app.MapPost("/api/notifications", async (
    CreateNotificationRequest request,
    NotificationService notifications,
    IHubContext<NotificationHub> hub) =>
{
    var notification = notifications.Create(request.UserEmail, request.Title, request.Message, request.Type, request.Link);
    await hub
        .Clients
        .Group(NotificationHub.GroupName(request.UserEmail))
        .SendAsync(NotificationHub.NotificationCreatedEvent, notification);

    return Results.Created($"/api/notifications/{notification.Id}", notification);
});

// ============================================================
// Finance API Routes
// ============================================================

app.MapGet("/api/admin/dashboard/financial-summary", async (
    string? period,
    string? startDate,
    string? endDate,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var p = period ?? "this-month";
    DateTimeOffset? start = DateTimeOffset.TryParse(startDate, out var s) ? s : null;
    DateTimeOffset? end = DateTimeOffset.TryParse(endDate, out var e) ? e : null;
    return Results.Ok(await dashboard.GetFinancialSummaryAsync(p, start, end));
});

app.MapGet("/api/admin/dashboard/financial-flow", async (
    string? period,
    string? startDate,
    string? endDate,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var p = period ?? "this-month";
    DateTimeOffset? start = DateTimeOffset.TryParse(startDate, out var s) ? s : null;
    DateTimeOffset? end = DateTimeOffset.TryParse(endDate, out var e) ? e : null;
    return Results.Ok(await dashboard.GetFinancialFlowAsync(p, start, end));
});

app.MapGet("/api/admin/dashboard/expense-categories", async (
    string? period,
    string? startDate,
    string? endDate,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    var p = period ?? "this-month";
    DateTimeOffset? start = DateTimeOffset.TryParse(startDate, out var s) ? s : null;
    DateTimeOffset? end = DateTimeOffset.TryParse(endDate, out var e) ? e : null;
    return Results.Ok(await dashboard.GetExpenseCategoriesAsync(p, start, end));
});

app.MapGet("/api/admin/expenses", async (
    string? search,
    string? category,
    string? startDate,
    string? endDate,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    if (!auth.IsAuthorized(context))
    {
        return Results.Unauthorized();
    }

    DateTimeOffset? start = DateTimeOffset.TryParse(startDate, out var s) ? s : null;
    DateTimeOffset? end = DateTimeOffset.TryParse(endDate, out var e) ? e : null;
    return Results.Ok(await dashboard.GetExpensesAsync(search, category, start, end));
});

app.MapPost("/api/admin/expenses", async (
    CreateExpenseRequest request,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Category) || request.Amount <= 0)
    {
        return Results.BadRequest(new { message = "Title, category and a positive amount are required." });
    }

    var expense = await dashboard.CreateExpenseAsync(request, principal.Email);
    return Results.Created($"/api/admin/expenses/{expense.Id}", expense);
});

app.MapPut("/api/admin/expenses/{id}", async (
    string id,
    UpdateExpenseRequest request,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Category) || request.Amount <= 0)
    {
        return Results.BadRequest(new { message = "Title, category and a positive amount are required." });
    }

    var expense = await dashboard.UpdateExpenseAsync(id, request);
    return expense is null ? Results.NotFound() : Results.Ok(expense);
});

app.MapDelete("/api/admin/expenses/{id}", async (
    string id,
    AdminDashboardService dashboard,
    AdminAuthService auth,
    HttpContext context) =>
{
    var principal = auth.ValidateRequest(context);
    if (principal?.Role != "admin")
    {
        return Results.Unauthorized();
    }

    return await dashboard.DeleteExpenseAsync(id) ? Results.NoContent() : Results.NotFound();
});

app.Run();
