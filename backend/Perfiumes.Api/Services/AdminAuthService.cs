using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Perfiumes.Api.Services;

public sealed class AdminAuthService(IConfiguration configuration)
{
    private readonly string _email = configuration["Admin:Email"] ?? "admin@perfiumes.local";
    private readonly string _password = configuration["Admin:Password"] ?? "ChangeMe123!";
    private readonly string _secret = configuration["Jwt:Secret"] ?? configuration["Admin:TokenSecret"] ?? "replace-this-dev-secret-with-a-long-random-production-secret";
    private readonly string _issuer = configuration["Jwt:Issuer"] ?? "Perfiumes.Api";
    private readonly string _audience = configuration["Jwt:Audience"] ?? "Perfiumes.Client";
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
        var expiresAt = DateTimeOffset.UtcNow.AddHours(8);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, email),
                new Claim(JwtRegisteredClaimNames.Email, email),
                new Claim(ClaimTypes.Email, email),
                new Claim(ClaimTypes.Role, role),
                new Claim("role", role)
            ],
            notBefore: DateTime.UtcNow,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
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
        var principal = context.User;
        if (principal.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var email = principal.FindFirstValue(ClaimTypes.Email)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirstValue("role");
        var exp = principal.FindFirstValue(JwtRegisteredClaimNames.Exp);
        var expiresAt = long.TryParse(exp, out var seconds)
            ? DateTimeOffset.FromUnixTimeSeconds(seconds)
            : DateTimeOffset.UtcNow;

        return string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(role)
            ? null
            : new TokenPrincipal(email, role, expiresAt);
    }
}

public sealed record TokenPrincipal(string Email, string Role, DateTimeOffset ExpiresAt);
