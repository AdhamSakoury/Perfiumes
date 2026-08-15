using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class PromoCodeService(PerfiumesDbContext db)
{
    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[PromoCodes]', N'U') IS NULL
BEGIN
    CREATE TABLE [PromoCodes] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_PromoCodes] PRIMARY KEY,
        [Code] nvarchar(40) NOT NULL,
        [Discount] decimal(5,4) NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [CreatedByEmail] nvarchar(256) NOT NULL,
        [IsActive] bit NOT NULL
    );
    CREATE UNIQUE INDEX [IX_PromoCodes_Code] ON [PromoCodes] ([Code]);
    CREATE INDEX [IX_PromoCodes_ExpiresAt] ON [PromoCodes] ([ExpiresAt]);
END
""");
    }

    public async Task<IReadOnlyList<PromoCodeDto>> GetAllAsync()
    {
        var promos = await db.PromoCodes
            .AsNoTracking()
            .OrderByDescending(promo => promo.CreatedAt)
            .ToListAsync();

        return promos.Select(ToDto).ToList();
    }

    public async Task<PromoCodeDto> CreateAsync(CreatePromoCodeRequest request, string adminEmail)
    {
        var code = NormalizeCode(request.Code);
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new InvalidOperationException("Promo code is required.");
        }

        if (request.DiscountPercent <= 0 || request.DiscountPercent > 95)
        {
            throw new InvalidOperationException("Discount must be between 1 and 95 percent.");
        }

        if (request.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            throw new InvalidOperationException("Expiration date must be in the future.");
        }

        var existing = await db.PromoCodes.FirstOrDefaultAsync(promo => promo.Code == code);
        if (existing is not null)
        {
            existing.Discount = Math.Round(request.DiscountPercent / 100, 4);
            existing.ExpiresAt = request.ExpiresAt.ToUniversalTime();
            existing.CreatedByEmail = adminEmail.Trim().ToLowerInvariant();
            existing.CreatedAt = DateTimeOffset.UtcNow;
            existing.IsActive = true;
            await db.SaveChangesAsync();
            return ToDto(existing);
        }

        var promo = new PromoCodeEntity
        {
            Id = $"promo_{Guid.NewGuid():N}",
            Code = code,
            Discount = Math.Round(request.DiscountPercent / 100, 4),
            ExpiresAt = request.ExpiresAt.ToUniversalTime(),
            CreatedAt = DateTimeOffset.UtcNow,
            CreatedByEmail = adminEmail.Trim().ToLowerInvariant(),
            IsActive = true
        };

        db.PromoCodes.Add(promo);
        await db.SaveChangesAsync();
        return ToDto(promo);
    }

    public async Task<PromoCodeValidationDto?> ValidateAsync(string code)
    {
        var normalized = NormalizeCode(code);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var promo = await db.PromoCodes
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Code == normalized && item.IsActive && item.ExpiresAt > DateTimeOffset.UtcNow);

        return promo is null
            ? null
            : new PromoCodeValidationDto(promo.Code, promo.Discount, promo.Discount * 100, promo.ExpiresAt);
    }

    private static string NormalizeCode(string code)
    {
        return code.Trim().ToUpperInvariant();
    }

    private static PromoCodeDto ToDto(PromoCodeEntity promo)
    {
        return new PromoCodeDto(
            promo.Id,
            promo.Code,
            promo.Discount,
            promo.Discount * 100,
            promo.ExpiresAt,
            promo.CreatedAt,
            promo.CreatedByEmail,
            promo.IsActive,
            promo.ExpiresAt <= DateTimeOffset.UtcNow);
    }
}
