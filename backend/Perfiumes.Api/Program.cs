using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Perfiumes.Api.Data;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;
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
    });
builder.Services.AddAuthorization();

builder.Services.AddSignalR();
builder.Services.Configure<PaymobOptions>(builder.Configuration.GetSection("Paymob"));
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
builder.Services.AddHttpClient<PaymobService>();

var app = builder.Build();

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

app.MapGet("/", () => Results.Ok(new
{
    app = "Perfiumes API",
    status = "running",
    endpoints = new[]
    {
        "POST /api/admin/login",
        "POST /api/auth/register",
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
        "GET /api/wallet",
        "POST /api/wallet/top-up",
        "PUT /api/admin/orders/{id}/status",
        "GET /api/admin/orders",
        "DELETE /api/admin/orders/{id}",
        "GET /api/admin/dashboard",
        "GET /api/admin/wallets",
        "POST /api/admin/wallets/{id}/adjust",
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
    foreach (var adminEmail in await users.GetAdminEmailsAsync())
    {
        await PublishNotificationAsync(notifications, hub, adminEmail, title, message, type, link);
    }
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
    foreach (var customerEmail in await users.GetCustomerEmailsAsync())
    {
        await PublishNotificationAsync(notifications, hub, customerEmail, title, message, type, link);
    }
}

app.MapPost("/api/admin/login", async (AdminLoginRequest request, UserService users) =>
{
    var result = await users.LoginAsync(request.Email, request.Password);
    return result is null || result.User.Role != "admin"
        ? Results.Unauthorized()
        : Results.Ok(new AdminLoginResponse(result.AccessToken, "Bearer", result.ExpiresAt));
});

app.MapPost("/api/auth/register", async (
    RegisterRequest request,
    UserService users,
    HttpContext context) =>
{
    if (string.IsNullOrWhiteSpace(request.FullName)
        || string.IsNullOrWhiteSpace(request.Email)
        || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Full name, email and password are required." });
    }

    var result = await users.RegisterAsync(request, context.Request);
    return result is null ? Results.Conflict(new { message = "Email already registered" }) : Results.Ok(result);
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
    IConfiguration configuration,
    HttpContext context) =>
{
    var activated = await users.ActivateEmailAsync(token);
    var frontendOrigin = configuration["Email:FrontendBaseUrl"] ?? "http://127.0.0.1:4200";
    var status = activated ? "activated" : "activation-failed";
    return Results.Redirect($"{frontendOrigin}/login?status={status}");
});

app.MapPost("/api/auth/forgot-password", async (
    ForgotPasswordRequest request,
    UserService users,
    HttpContext context) =>
{
    var result = await users.PreparePasswordResetAsync(request, context.Request);
    return Results.Ok(result);
});

app.MapPost("/api/auth/reset-password", async (ResetPasswordRequest request, UserService users) =>
{
    if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
    {
        return Results.BadRequest(new { message = "Password must be at least 8 characters." });
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
    NotificationService notifications,
    HttpContext context,
    IHubContext<NotificationHub> notificationHub) =>
{
    if (string.IsNullOrWhiteSpace(request.UserEmail) || request.Items.Count == 0)
    {
        return Results.BadRequest(new { message = "User email and order items are required." });
    }

    var walletPayment = request.PaymentMethod?.Trim().Equals("wallet", StringComparison.OrdinalIgnoreCase) == true;
    var principal = walletPayment ? auth.ValidateRequest(context) : null;
    if (walletPayment && principal is null)
    {
        return Results.Unauthorized();
    }

    OrderDto order;
    try
    {
        order = await orders.CreateAsync(request, principal?.Email);
    }
    catch (UnauthorizedAccessException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }

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
    await PublishAdminNotificationAsync(
        users,
        notifications,
        notificationHub,
        "New order",
        $"{order.UserEmail} placed order {order.Id} for {order.Total:0.##} EGP via {order.PaymentMethod}.",
        "order",
        "/admin/orders");

    return Results.Created($"/api/orders/{order.Id}", order);
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

app.MapPost("/api/payments/paymob/checkout", async (
    PaymobCheckoutRequest request,
    OrderService orders,
    PaymobService paymob,
    CancellationToken cancellationToken) =>
{
    var order = await orders.GetByIdAsync(request.OrderId);
    if (order is null)
    {
        return Results.NotFound(new { message = "Order was not found." });
    }

    if (order.PaymentMethod != "card")
    {
        return Results.BadRequest(new { message = "This order is not configured for card payment." });
    }

    try
    {
        var checkout = await paymob.CreateCheckoutAsync(order, cancellationToken);
        await orders.MarkPaymentStartedAsync(order.Id, "Paymob", checkout.ClientSecret);
        return Results.Ok(checkout);
    }
    catch (InvalidOperationException exception)
    {
        return Results.BadRequest(new { message = exception.Message });
    }
});

app.MapPost("/api/payments/status", async (
    PaymentStatusUpdateRequest request,
    OrderService orders) =>
{
    var order = await orders.UpdatePaymentStatusAsync(request.OrderId, request.Status, request.Reference);
    return order is null ? Results.NotFound() : Results.Ok(order);
});

app.MapPost("/api/payments/paymob/webhook", async (
    HttpRequest request,
    OrderService orders) =>
{
    using var document = await JsonDocument.ParseAsync(request.Body);
    var root = document.RootElement;
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

app.Run();
