using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class UserService(PerfiumesDbContext db, PasswordService passwords, AdminAuthService tokens)
{
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
        new("test_customer_9", "Ahmed Nabil", "ahmed@test.local", "Test123!", "customer", "+20 100 000 0010", "Mansoura"),
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

    public async Task<AuthLoginResponse?> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(user => user.Email == email))
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
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
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return CreateLoginResponse(user);
    }

    public async Task<AuthLoginResponse?> LoginAsync(string email, string password)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        return user is not null && passwords.Verify(password, user.PasswordHash) ? CreateLoginResponse(user) : null;
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

        user.FullName = fullName;
        user.ProfilePhoto = profilePhoto;
        user.Role = role;
        user.AuthProvider = "google";
        user.UpdatedAt = now;
        await db.SaveChangesAsync();
        return CreateLoginResponse(user);
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

    private sealed record SeedUser(
        string Id,
        string FullName,
        string Email,
        string Password,
        string Role,
        string Phone,
        string Address);
}
