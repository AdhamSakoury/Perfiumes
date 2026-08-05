namespace Perfiumes.Api.Models;

public sealed record AdminLoginRequest(string Email, string Password);

public sealed record AdminLoginResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAt);

public sealed record GoogleLoginRequest(string Credential);

public sealed record AuthUserResponse(
    string Id,
    string FullName,
    string Email,
    string? ProfilePhoto,
    string Role);

public sealed record AuthLoginResponse(
    string AccessToken,
    string TokenType,
    DateTimeOffset ExpiresAt,
    AuthUserResponse User);
