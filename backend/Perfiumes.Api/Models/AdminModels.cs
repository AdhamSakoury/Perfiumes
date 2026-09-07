namespace Perfiumes.Api.Models;

public sealed record AdminLoginRequest(string Email, string Password);

public sealed record AdminLoginResponse(string AccessToken, string TokenType, DateTimeOffset ExpiresAt);

public sealed record GoogleLoginRequest(string Credential);

public sealed record AuthUserResponse(
    string Id,
    string FullName,
    string Email,
    string? ProfilePhoto,
    string Role,
    string Phone,
    string Address,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AuthLoginResponse(
    string AccessToken,
    string TokenType,
    DateTimeOffset ExpiresAt,
    AuthUserResponse User);

public sealed record AdminUserDto(
    string Id,
    string FullName,
    string Email,
    string? ProfilePhoto,
    string Role,
    string Phone,
    string Address,
    string AuthProvider,
    bool IsEmailConfirmed,
    bool IsBlocked,
    string? BlockReason,
    DateTimeOffset? BlockedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    int OrdersCount,
    decimal WalletBalance);

public sealed record ToggleUserBlockRequest(bool IsBlocked, string? Reason);

