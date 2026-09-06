namespace Perfiumes.Api.Models;

public sealed record RegisterRequest(string FullName, string Email, string Password, string? Phone, string? Address);

public sealed record RegisterResponse(string Message, bool EmailSent = false, string? DevActivationUrl = null);

public sealed record ActivateEmailRequest(string Token);

public sealed record ActivateEmailResponse(bool Success, string Message);

public sealed record ResendActivationRequest(string Email);

public sealed record LoginRequest(string Email, string Password);

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
