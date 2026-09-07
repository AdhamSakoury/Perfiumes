namespace Perfiumes.Api.Data.Entities;

public sealed class AppUserEntity
{
    public string Id { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? ProfilePhoto { get; set; }
    public string Role { get; set; } = "customer";
    public string AuthProvider { get; set; } = "local";
    public bool IsEmailConfirmed { get; set; } = true;
    public string? EmailActivationTokenHash { get; set; }
    public DateTimeOffset? EmailActivationTokenExpiresAt { get; set; }
    public string? ResetPasswordTokenHash { get; set; }
    public DateTimeOffset? ResetPasswordTokenExpiresAt { get; set; }
    public bool IsBlocked { get; set; } = false;
    public string? BlockReason { get; set; }
    public DateTimeOffset? BlockedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
