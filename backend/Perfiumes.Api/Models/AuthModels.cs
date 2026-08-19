namespace Perfiumes.Api.Models;

public sealed record RegisterRequest(string FullName, string Email, string Password, string? Phone, string? Address);

public sealed record RegisterResponse(string Message);

public sealed record LoginRequest(string Email, string Password);

public sealed record ActivateEmailResponse(string Message);

public sealed record ForgotPasswordRequest(string Email);

public sealed record ForgotPasswordResponse(string Message, string? ResetUrl, DateTimeOffset? ExpiresAt);

public sealed record ResetPasswordRequest(string Token, string NewPassword);

public sealed record UpdateProfileRequest(
    string FullName,
    string Email,
    string? Phone,
    string? Address,
    string? CurrentPassword,
    string? NewPassword);
