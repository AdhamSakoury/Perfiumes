using System.Security.Cryptography;
using System.Text;

namespace Perfiumes.Api.Services;

public sealed class AdminAuthService(IConfiguration configuration)
{
    private readonly string _email = configuration["Admin:Email"] ?? "admin@perfiumes.local";
    private readonly string _password = configuration["Admin:Password"] ?? "ChangeMe123!";
    private readonly string _secret = configuration["Admin:TokenSecret"] ?? "dev-secret";
    private readonly HashSet<string> _googleAdminEmails = configuration
        .GetSection("Admin:GoogleAdminEmails")
        .Get<string[]>()?
        .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];

    public string? Login(string email, string password)
    {
        if (!string.Equals(email, _email, StringComparison.OrdinalIgnoreCase) || password != _password)
        {
            return null;
        }

        return CreateToken(email, "admin").AccessToken;
    }

    public (string AccessToken, DateTimeOffset ExpiresAt) CreateToken(string email, string role)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddHours(8).ToUnixTimeSeconds();
        var payload = $"{email}|{role}|{expiresAt}";
        var signature = Sign(payload);

        return (Convert.ToBase64String(Encoding.UTF8.GetBytes($"{payload}|{signature}")),
            DateTimeOffset.FromUnixTimeSeconds(expiresAt));
    }

    public string RoleForGoogleEmail(string email)
    {
        return _googleAdminEmails.Contains(email) ? "admin" : "customer";
    }

    public bool IsAuthorized(HttpContext context)
    {
        var principal = ValidateRequest(context);
        return principal?.Role == "admin";
    }

    public TokenPrincipal? ValidateRequest(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var token = header["Bearer ".Length..].Trim();
        return ValidateToken(token);
    }

    public TokenPrincipal? ValidateToken(string token)
    {
        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(token));
            var parts = decoded.Split('|');
            if (parts.Length != 4)
            {
                return null;
            }

            var payload = $"{parts[0]}|{parts[1]}|{parts[2]}";
            var expectedSignature = Sign(payload);
            if (!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(expectedSignature),
                    Encoding.UTF8.GetBytes(parts[3])))
            {
                return null;
            }

            if (!long.TryParse(parts[2], out var expiresAt)
                || DateTimeOffset.UtcNow.ToUnixTimeSeconds() >= expiresAt)
            {
                return null;
            }

            return new TokenPrincipal(parts[0], parts[1], DateTimeOffset.FromUnixTimeSeconds(expiresAt));
        }
        catch
        {
            return null;
        }
    }

    private string Sign(string value)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(_secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(value)));
    }
}

public sealed record TokenPrincipal(string Email, string Role, DateTimeOffset ExpiresAt);
