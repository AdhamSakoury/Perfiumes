namespace Perfiumes.Api.Models;

public sealed record RegisterRequest(string FullName, string Email, string Password, string? Phone, string? Address);

public sealed record LoginRequest(string Email, string Password);

public sealed record UpdateProfileRequest(
    string FullName,
    string Email,
    string? Phone,
    string? Address,
    string? CurrentPassword,
    string? NewPassword);
