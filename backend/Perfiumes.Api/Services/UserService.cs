using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;
using System.Security.Cryptography;
using System.Text;

namespace Perfiumes.Api.Services;

public sealed class UserService(
    PerfiumesDbContext db,
    PasswordService passwords,
    AdminAuthService tokens,
    EmailService emails,
    IOptions<EmailOptions> emailOptions,
    IHostEnvironment environment)
{
    private const int ActivationTokenLifetimeHours = 24;

    private readonly EmailOptions _emailOptions = emailOptions.Value;

    private static readonly SeedUser[] SeedUsers =
    [
        new("test_admin", "Ganouby Admin", "admin@ganouby.local", "Admin123!", "admin", "+20 100 000 0001", "Ganouby HQ, Cairo"),
        new("test_customer_1", "Mariam Hassan", "mariam@test.local", "Test123!", "customer", "+20 100 000 0002", "Zamalek, Cairo"),
        new("test_customer_2", "Omar Saleh", "omar@test.local", "Test123!", "customer", "+20 100 000 0003", "Maadi, Cairo"),
        new("test_customer_3", "Adham", "adham@test.local", "Test123!", "customer", "+20 100 000 0004", "Cairo"),
        new("test_customer_4", "Youssef Ali", "youssef@test.local", "Test123!", "customer", "+20 100 000 0005", "Nasr City, Cairo"),
        new("test_customer_5", "Nour Ahmed", "nour@test.local", "Test123!", "customer", "+20 100 000 0006", "Heliopolis, Cairo"),
        new("test_customer_6", "Salma Ibrahim", "salma@test.local", "Test123!", "customer", "+20 100 000 0007", "New Cairo, Cairo"),
        new("test_customer_7", "Khaled Samir", "khaled@test.local", "Test123!", "customer", "+20 100 000 0008", "6th of October, Giza"),
        new("test_customer_8", "Farida Mostafa", "farida@test.local", "Test123!", "customer", "+20 100 000 0009", "Dokki, Giza"),
        new("test_customer_9", "Ahmed Nabil", "ahmed@test.local", "Test123!", "customer", "+20 100 000 00010", "Mansoura"),
        new("test_customer_10", "Laila Fathy", "laila@test.local", "Test123!", "customer", "+20 100 000 0011", "Alexandria"),
        new("test_customer_11", "Hana Mahmoud", "hana@test.local", "Test123!", "customer", "+20 100 000 0012", "Aswan"),
        new("test_customer_12", "Karim Adel", "karim@test.local", "Test123!", "customer", "+20 100 000 0013", "Luxor"),
        new("test_customer_13", "Dina Tarek", "dina@test.local", "Test123!", "customer", "+20 100 000 0014", "Hurghada")
    ];

    public async Task SeedAsync(IConfiguration configuration)
    {
        var adminEmail = configuration["Admin:Email"] ?? "admin@ganouby.local";
        var adminPassword = configuration["Admin:Password"] ?? "Admin123!";

        foreach (var seedUser in SeedUsers)
        {
            var user = seedUser.Role == "admin"
                ? seedUser with { Email = adminEmail, Password = adminPassword }
                : seedUser;

            await SeedUserAsync(user);
        }

        await db.SaveChangesAsync();
    }

    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF COL_LENGTH(N'[Users]', N'ResetPasswordTokenHash') IS NULL
    ALTER TABLE [Users] ADD [ResetPasswordTokenHash] nvarchar(128) NULL;

IF COL_LENGTH(N'[Users]', N'ResetPasswordTokenExpiresAt') IS NULL
    ALTER TABLE [Users] ADD [ResetPasswordTokenExpiresAt] datetimeoffset NULL;

IF COL_LENGTH(N'[Users]', N'IsEmailConfirmed') IS NULL
    ALTER TABLE [Users] ADD [IsEmailConfirmed] bit NOT NULL CONSTRAINT [DF_Users_IsEmailConfirmed] DEFAULT 1;

IF COL_LENGTH(N'[Users]', N'EmailActivationTokenHash') IS NULL
    ALTER TABLE [Users] ADD [EmailActivationTokenHash] nvarchar(128) NULL;

IF COL_LENGTH(N'[Users]', N'EmailActivationTokenExpiresAt') IS NULL
    ALTER TABLE [Users] ADD [EmailActivationTokenExpiresAt] datetimeoffset NULL;

IF COL_LENGTH(N'[Users]', N'IsBlocked') IS NULL
    ALTER TABLE [Users] ADD [IsBlocked] bit NOT NULL CONSTRAINT [DF_Users_IsBlocked] DEFAULT 0;

IF COL_LENGTH(N'[Users]', N'BlockReason') IS NULL
    ALTER TABLE [Users] ADD [BlockReason] nvarchar(500) NULL;

IF COL_LENGTH(N'[Users]', N'BlockedAt') IS NULL
    ALTER TABLE [Users] ADD [BlockedAt] datetimeoffset NULL;
""");
    }

    public async Task<RegisterResponse?> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var autoConfirm = _emailOptions.AutoConfirmEmail;
        var existingUser = await db.Users.FirstOrDefaultAsync(user => user.Email == email);

        if (existingUser is not null)
        {
            if (existingUser.AuthProvider == "local" && !existingUser.IsEmailConfirmed)
            {
                var now = DateTimeOffset.UtcNow;
                var newToken = CreateToken();
                existingUser.FullName = request.FullName.Trim();
                existingUser.PasswordHash = passwords.Hash(request.Password);
                existingUser.Phone = request.Phone?.Trim() ?? string.Empty;
                existingUser.Address = request.Address?.Trim() ?? string.Empty;
                existingUser.EmailActivationTokenHash = HashToken(newToken);
                existingUser.EmailActivationTokenExpiresAt = now.AddHours(ActivationTokenLifetimeHours);
                existingUser.IsEmailConfirmed = autoConfirm;
                existingUser.UpdatedAt = now;
                await db.SaveChangesAsync();

                return await SendActivationAsync(existingUser.Email, existingUser.FullName, newToken, autoConfirm, "Account updated.");
            }

            return null;
        }

        var utcNow = DateTimeOffset.UtcNow;
        var activationToken = CreateToken();
        var user = new AppUserEntity
        {
            Id = $"user_{Guid.NewGuid():N}",
            FullName = request.FullName.Trim(),
            Email = email,
            PasswordHash = passwords.Hash(request.Password),
            Phone = request.Phone?.Trim() ?? string.Empty,
            Address = request.Address?.Trim() ?? string.Empty,
            Role = "customer",
            AuthProvider = "local",
            IsEmailConfirmed = autoConfirm,
            EmailActivationTokenHash = HashToken(activationToken),
            EmailActivationTokenExpiresAt = utcNow.AddHours(ActivationTokenLifetimeHours),
            CreatedAt = utcNow,
            UpdatedAt = utcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return await SendActivationAsync(user.Email, user.FullName, activationToken, autoConfirm, "Account created.");
    }

    public async Task<RegisterResponse> ResendActivationEmailAsync(ResendActivationRequest request)
    {
        var genericMessage = "If this email needs activation, an activation email has been sent.";
        var email = request.Email.Trim().ToLowerInvariant().Replace("\\@", "@");
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            return new RegisterResponse(genericMessage);
        }

        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == email);
        if (user is null || user.AuthProvider != "local" || user.IsEmailConfirmed)
        {
            return new RegisterResponse(genericMessage);
        }

        var now = DateTimeOffset.UtcNow;
        var activationToken = CreateToken();
        user.EmailActivationTokenHash = HashToken(activationToken);
        user.EmailActivationTokenExpiresAt = now.AddHours(ActivationTokenLifetimeHours);
        user.UpdatedAt = now;
        await db.SaveChangesAsync();

        var result = await SendActivationAsync(user.Email, user.FullName, activationToken, false, "Activation email sent.");
        return new RegisterResponse(genericMessage, result.EmailSent, result.DevActivationUrl);
    }

    public async Task<AuthLoginResponse?> LoginAsync(string email, string password)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        if (user is null || !passwords.Verify(password, user.PasswordHash))
        {
            return null;
        }

        if (user.IsBlocked)
        {
            var reason = string.IsNullOrWhiteSpace(user.BlockReason)
                ? "Your account has been suspended. Please contact support."
                : $"Your account has been suspended: {user.BlockReason}";
            throw new UnauthorizedAccessException(reason);
        }

        if (user.AuthProvider == "local" && !user.IsEmailConfirmed)
        {
            throw new UnauthorizedAccessException("Please activate your account from the email we sent you.");
        }

        return CreateLoginResponse(user);
    }

    public async Task<bool> ActivateEmailAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        var tokenHash = HashToken(token);
        var now = DateTimeOffset.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(item =>
            item.EmailActivationTokenHash == tokenHash
            && item.EmailActivationTokenExpiresAt != null
            && item.EmailActivationTokenExpiresAt > now);

        if (user is null)
        {
            return false;
        }

        user.IsEmailConfirmed = true;
        user.EmailActivationTokenHash = null;
        user.EmailActivationTokenExpiresAt = null;
        user.UpdatedAt = now;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<ForgotPasswordResponse> PreparePasswordResetAsync(ForgotPasswordRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var genericMessage = "If this email exists, password reset instructions are ready.";

        if (string.IsNullOrWhiteSpace(normalizedEmail) || !normalizedEmail.Contains('@'))
        {
            return new ForgotPasswordResponse(genericMessage, null, null);
        }

        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        if (user is null || user.AuthProvider != "local")
        {
            return new ForgotPasswordResponse(genericMessage, null, null);
        }

        var token = CreateToken();
        var resetTokenLifetimeMinutes = Math.Clamp(_emailOptions.PasswordResetTokenLifetimeMinutes, 5, 120);
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(resetTokenLifetimeMinutes);
        user.ResetPasswordTokenHash = HashToken(token);
        user.ResetPasswordTokenExpiresAt = expiresAt;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();

        var resetUrl = $"{_emailOptions.FrontendBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(token)}";
        var emailSent = await emails.SendPasswordResetEmailAsync(user.Email, user.FullName, resetUrl, resetTokenLifetimeMinutes);
        var devResetUrl = !emailSent && environment.IsDevelopment() && _emailOptions.DevFallbackLinks ? resetUrl : null;
        return new ForgotPasswordResponse(genericMessage, devResetUrl, expiresAt);
    }

    public async Task<AuthLoginResponse?> ResetPasswordAsync(ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return null;
        }

        var tokenHash = HashToken(request.Token);
        var now = DateTimeOffset.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(item =>
            item.ResetPasswordTokenHash == tokenHash
            && item.ResetPasswordTokenExpiresAt != null
            && item.ResetPasswordTokenExpiresAt > now);

        if (user is null)
        {
            return null;
        }

        user.PasswordHash = passwords.Hash(request.NewPassword);
        user.ResetPasswordTokenHash = null;
        user.ResetPasswordTokenExpiresAt = null;
        user.AuthProvider = "local";
        user.IsEmailConfirmed = true;
        user.UpdatedAt = now;
        await db.SaveChangesAsync();
        return CreateLoginResponse(user);
    }

    public async Task<AuthLoginResponse?> UpdateProfileAsync(string currentEmail, UpdateProfileRequest request)
    {
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == currentEmail.Trim().ToLowerInvariant());
        if (user is null)
        {
            return null;
        }

        var nextEmail = request.Email.Trim().ToLowerInvariant();
        if (nextEmail != user.Email && await db.Users.AnyAsync(item => item.Email == nextEmail))
        {
            throw new InvalidOperationException("Email already registered.");
        }

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            if (string.IsNullOrWhiteSpace(request.CurrentPassword) || !passwords.Verify(request.CurrentPassword, user.PasswordHash))
            {
                throw new UnauthorizedAccessException("Current password is incorrect.");
            }

            user.PasswordHash = passwords.Hash(request.NewPassword);
        }

        user.FullName = request.FullName.Trim();
        user.Email = nextEmail;
        user.Phone = request.Phone?.Trim() ?? string.Empty;
        user.Address = request.Address?.Trim() ?? string.Empty;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return CreateLoginResponse(user);
    }

    public async Task<AuthLoginResponse> UpsertGoogleUserAsync(string id, string fullName, string email, string? profilePhoto, string role)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var now = DateTimeOffset.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        if (user is null)
        {
            user = new AppUserEntity
            {
                Id = id,
                Email = normalizedEmail,
                PasswordHash = passwords.Hash(Guid.NewGuid().ToString("N")),
                CreatedAt = now
            };
            db.Users.Add(user);
        }
        else if (user.IsBlocked)
        {
            var reason = string.IsNullOrWhiteSpace(user.BlockReason)
                ? "Your account has been suspended. Please contact support."
                : $"Your account has been suspended: {user.BlockReason}";
            throw new UnauthorizedAccessException(reason);
        }

        user.FullName = fullName;
        user.ProfilePhoto = profilePhoto;
        user.Role = role;
        user.AuthProvider = "google";
        user.IsEmailConfirmed = true;
        user.UpdatedAt = now;
        await db.SaveChangesAsync();
        return CreateLoginResponse(user);
    }

    public async Task<IReadOnlyList<AdminUserDto>> GetAdminUsersAsync()
    {
        var users = await db.Users
            .AsNoTracking()
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync();

        var userEmails = users.Select(u => u.Email).ToList();
        var userIds = users.Select(u => u.Id).ToList();

        var orderCounts = await db.Orders
            .AsNoTracking()
            .Where(o => userEmails.Contains(o.UserEmail))
            .GroupBy(o => o.UserEmail)
            .Select(g => new { Email = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.Email, g => g.Count, StringComparer.OrdinalIgnoreCase);

        var walletBalances = await db.UserWallets
            .AsNoTracking()
            .Where(w => userEmails.Contains(w.UserEmail) || userIds.Contains(w.UserId))
            .ToListAsync();

        var walletMap = walletBalances
            .GroupBy(w => w.UserEmail, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First().Balance, StringComparer.OrdinalIgnoreCase);

        return users.Select(u => new AdminUserDto(
            u.Id,
            u.FullName,
            u.Email,
            u.ProfilePhoto,
            u.Role,
            u.Phone,
            u.Address,
            u.AuthProvider,
            u.IsEmailConfirmed,
            u.IsBlocked,
            u.BlockReason,
            u.BlockedAt,
            u.CreatedAt,
            u.UpdatedAt,
            orderCounts.TryGetValue(u.Email, out var count) ? count : 0,
            walletMap.TryGetValue(u.Email, out var balance) ? balance : 0
        )).ToList();
    }

    public async Task<AdminUserDto?> ToggleUserBlockAsync(string userId, bool isBlocked, string? reason, string adminEmail)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId || u.Email == userId.ToLowerInvariant());
        if (user is null)
        {
            return null;
        }

        if (user.Role == "admin" && isBlocked)
        {
            throw new InvalidOperationException("Cannot block an administrator account.");
        }

        var now = DateTimeOffset.UtcNow;
        user.IsBlocked = isBlocked;
        user.BlockReason = isBlocked ? (string.IsNullOrWhiteSpace(reason) ? "Blocked by admin" : reason.Trim()) : null;
        user.BlockedAt = isBlocked ? now : null;
        user.UpdatedAt = now;

        await db.SaveChangesAsync();

        var ordersCount = await db.Orders.CountAsync(o => o.UserEmail == user.Email);
        var wallet = await db.UserWallets.FirstOrDefaultAsync(w => w.UserEmail == user.Email);

        return new AdminUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.ProfilePhoto,
            user.Role,
            user.Phone,
            user.Address,
            user.AuthProvider,
            user.IsEmailConfirmed,
            user.IsBlocked,
            user.BlockReason,
            user.BlockedAt,
            user.CreatedAt,
            user.UpdatedAt,
            ordersCount,
            wallet?.Balance ?? 0
        );
    }

    public async Task<IReadOnlyList<string>> GetAdminEmailsAsync()
    {
        return await db.Users
            .AsNoTracking()
            .Where(user => user.Role == "admin")
            .Select(user => user.Email)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<string>> GetCustomerEmailsAsync()
    {
        return await db.Users
            .AsNoTracking()
            .Where(user => user.Role == "customer")
            .Select(user => user.Email)
            .ToListAsync();
    }

    private async Task<RegisterResponse> SendActivationAsync(
        string email,
        string fullName,
        string activationToken,
        bool autoConfirm,
        string prefix)
    {
        var activationUrl = BuildActivationUrl(activationToken);
        LogActivationLink(email, activationUrl);

        if (autoConfirm)
        {
            return new RegisterResponse($"{prefix} Your account is activated and ready to use.", true);
        }

        var emailSent = await emails.SendActivationEmailAsync(email, fullName, activationUrl);
        if (emailSent)
        {
            return new RegisterResponse("Activation email sent. Please check your inbox to activate your account.", true);
        }

        var devActivationUrl = environment.IsDevelopment() && _emailOptions.DevFallbackLinks ? activationUrl : null;
        var message = devActivationUrl is not null
            ? "Account created. SMTP is not configured — use the activation link shown below or in the server console."
            : "Account created, but the activation email could not be sent. Please contact support or try resending confirmation.";

        return new RegisterResponse(message, false, devActivationUrl);
    }

    private string BuildActivationUrl(string activationToken)
    {
        var frontendBase = _emailOptions.FrontendBaseUrl.TrimEnd('/');
        return $"{frontendBase}/activate?token={Uri.EscapeDataString(activationToken)}";
    }

    private static void LogActivationLink(string email, string activationUrl)
    {
        Console.WriteLine();
        Console.WriteLine("=======================================================");
        Console.WriteLine($"[EMAIL ACTIVATION LINK FOR {email}]:");
        Console.WriteLine(activationUrl);
        Console.WriteLine("=======================================================");
        Console.WriteLine();
    }

    private async Task SeedUserAsync(SeedUser seedUser)
    {
        var normalizedEmail = seedUser.Email.Trim().ToLowerInvariant();
        var now = DateTimeOffset.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        if (user is null)
        {
            user = new AppUserEntity
            {
                Id = seedUser.Id,
                Email = normalizedEmail,
                CreatedAt = now
            };
            db.Users.Add(user);
        }

        user.Id = seedUser.Id;
        user.FullName = seedUser.FullName;
        user.Email = normalizedEmail;
        if (string.IsNullOrWhiteSpace(user.PasswordHash) || !passwords.Verify(seedUser.Password, user.PasswordHash))
        {
            user.PasswordHash = passwords.Hash(seedUser.Password);
        }
        user.Phone = seedUser.Phone;
        user.Address = seedUser.Address;
        user.Role = seedUser.Role;
        user.AuthProvider = "local";
        user.IsEmailConfirmed = true;
        user.EmailActivationTokenHash = null;
        user.EmailActivationTokenExpiresAt = null;
        user.UpdatedAt = now;
    }

    private AuthLoginResponse CreateLoginResponse(AppUserEntity user)
    {
        var token = tokens.CreateToken(user.Email, user.Role);
        return new AuthLoginResponse(
            token.AccessToken,
            "Bearer",
            token.ExpiresAt,
            new AuthUserResponse(
                user.Id,
                user.FullName,
                user.Email,
                user.ProfilePhoto,
                user.Role,
                user.Phone,
                user.Address,
                user.CreatedAt,
                user.UpdatedAt));
    }

    private static string CreateToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string HashToken(string token)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToBase64String(hash);
    }

    private sealed record SeedUser(
        string Id,
        string FullName,
        string Email,
        string Password,
        string Role,
        string Phone,
        string Address);
}
