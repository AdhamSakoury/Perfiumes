using System.Text.Json;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class GoogleAuthService(HttpClient httpClient, IConfiguration configuration, AdminAuthService auth)
{
    private readonly string _clientId = configuration["GoogleAuth:ClientId"] ?? "";

    public async Task<AuthLoginResponse?> LoginAsync(string credential, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_clientId) || _clientId == "PASTE_GOOGLE_CLIENT_ID_HERE")
        {
            throw new InvalidOperationException("GoogleAuth:ClientId is not configured.");
        }

        var tokenInfo = await VerifyCredentialAsync(credential, cancellationToken);
        if (tokenInfo is null || !string.Equals(tokenInfo.Audience, _clientId, StringComparison.Ordinal))
        {
            return null;
        }

        var role = auth.RoleForGoogleEmail(tokenInfo.Email);
        var token = auth.CreateToken(tokenInfo.Email, role);

        return new AuthLoginResponse(
            token.AccessToken,
            "Bearer",
            token.ExpiresAt,
            new AuthUserResponse(
                $"google_{tokenInfo.Subject}",
                tokenInfo.Name,
                tokenInfo.Email,
                tokenInfo.Picture,
                role));
    }

    private async Task<GoogleTokenInfo?> VerifyCredentialAsync(string credential, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(
            $"https://oauth2.googleapis.com/tokeninfo?id_token={Uri.EscapeDataString(credential)}",
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;

        if (!root.TryGetProperty("email_verified", out var verified)
            || !string.Equals(verified.GetString(), "true", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return new GoogleTokenInfo(
            RequiredString(root, "sub"),
            RequiredString(root, "aud"),
            RequiredString(root, "email"),
            OptionalString(root, "name") ?? RequiredString(root, "email"),
            OptionalString(root, "picture"));
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw new InvalidOperationException($"Google token is missing '{propertyName}'.");
        }

        return property.GetString()!;
    }

    private static string? OptionalString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) ? property.GetString() : null;
    }

    private sealed record GoogleTokenInfo(
        string Subject,
        string Audience,
        string Email,
        string Name,
        string? Picture);
}
