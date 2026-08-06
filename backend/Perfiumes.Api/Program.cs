using Microsoft.AspNetCore.SignalR;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<ProductRepository>();
builder.Services.AddSingleton<AdminAuthService>();
builder.Services.AddSingleton<ChatbotService>();
builder.Services.AddSingleton<NotificationService>();
builder.Services.AddHttpClient<GoogleAuthService>();

var app = builder.Build();

app.UseCors("Frontend");
app.MapHub<NotificationHub>("/notificationHub");

app.MapGet("/", () => Results.Ok(new
{
    app = "Perfiumes API",
    status = "running",
    endpoints = new[]
    {
        "POST /api/admin/login",
        "POST /api/auth/google",
        "GET /api/products",
        "GET /api/products/{id}",
        "POST /api/products",
        "PUT /api/products/{id}",
        "DELETE /api/products/{id}",
        "POST /api/chatbot/message",
        "GET /api/notifications",
        "POST /api/notifications/{id}/read",
        "POST /api/notifications/read-all",
        "POST /api/notifications"
    }
}));

app.MapPost("/api/admin/login", (AdminLoginRequest request, AdminAuthService auth) =>
{
    var token = auth.Login(request.Email, request.Password);
    return token is null
        ? Results.Unauthorized()
        : Results.Ok(new AdminLoginResponse(token, "Bearer", DateTimeOffset.UtcNow.AddHours(8)));
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
    var notification = notifications.Create(request.UserEmail, request.Title, request.Message, request.Type);
    await hub
        .Clients
        .Group(NotificationHub.GroupName(request.UserEmail))
        .SendAsync(NotificationHub.NotificationCreatedEvent, notification);

    return Results.Created($"/api/notifications/{notification.Id}", notification);
});

app.Run();
