namespace Perfiumes.Api.Models;

public sealed record PromoCodeDto(
    string Id,
    string Code,
    decimal Discount,
    decimal DiscountPercent,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt,
    string CreatedByEmail,
    bool IsActive,
    bool IsExpired);

public sealed record CreatePromoCodeRequest(
    string Code,
    decimal DiscountPercent,
    DateTimeOffset ExpiresAt);

public sealed record ValidatePromoCodeRequest(string Code);

public sealed record PromoCodeValidationDto(
    string Code,
    decimal Discount,
    decimal DiscountPercent,
    DateTimeOffset ExpiresAt);
