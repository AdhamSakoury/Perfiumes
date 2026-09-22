using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Perfiumes.Api.Data;
using Perfiumes.Api.Hubs;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

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
                    context.Fail("This account is blocked.");
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
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
builder.Services.AddScoped<DeliveryZoneService>();
builder.Services.AddScoped<AdminDashboardService>();
builder.Services.AddScoped<PromoCodeService>();
builder.Services.AddScoped<NewsletterService>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<GoogleAuthService>();
builder.Services.AddHttpClient<PaymobService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
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
app.UseStaticFiles();

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
    await scope.ServiceProvider.GetRequiredService<DeliveryZoneService>().EnsureSchemaAsync();
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
app.MapControllers();
app.MapHub<NotificationHub>("/notificationHub");
app.MapHub<SupportMessageHub>("/supportHub");
app.MapHub<OrderTrackingHub>("/orderTrackingHub");
app.Run();
