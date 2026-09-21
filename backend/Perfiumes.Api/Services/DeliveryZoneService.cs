using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class DeliveryZoneService(PerfiumesDbContext db)
{
    public async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[DeliveryZones]', N'U') IS NULL
BEGIN
    CREATE TABLE [DeliveryZones] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_DeliveryZones] PRIMARY KEY,
        [Name] nvarchar(160) NOT NULL,
        [CityRegion] nvarchar(160) NOT NULL,
        [MinFee] decimal(18,2) NOT NULL,
        [MaxFee] decimal(18,2) NOT NULL,
        [FixedFee] decimal(18,2) NOT NULL,
        [DefaultFee] decimal(18,2) NOT NULL,
        [PricingType] nvarchar(24) NOT NULL,
        [EstimatedDays] int NOT NULL CONSTRAINT [DF_DeliveryZones_EstimatedDays] DEFAULT 3,
        [SortOrder] int NOT NULL CONSTRAINT [DF_DeliveryZones_SortOrder] DEFAULT 0,
        [IsActive] bit NOT NULL CONSTRAINT [DF_DeliveryZones_IsActive] DEFAULT 1,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL
    );
END

IF OBJECT_ID(N'[DeliveryZoneAreas]', N'U') IS NULL
BEGIN
    CREATE TABLE [DeliveryZoneAreas] (
        [Id] nvarchar(64) NOT NULL CONSTRAINT [PK_DeliveryZoneAreas] PRIMARY KEY,
        [DeliveryZoneId] nvarchar(64) NOT NULL,
        [Name] nvarchar(160) NOT NULL,
        [Fee] decimal(18,2) NOT NULL,
        [SortOrder] int NOT NULL CONSTRAINT [DF_DeliveryZoneAreas_SortOrder] DEFAULT 0,
        [IsActive] bit NOT NULL CONSTRAINT [DF_DeliveryZoneAreas_IsActive] DEFAULT 1,
        CONSTRAINT [FK_DeliveryZoneAreas_DeliveryZones_DeliveryZoneId] FOREIGN KEY ([DeliveryZoneId]) REFERENCES [DeliveryZones] ([Id]) ON DELETE CASCADE
    );
    CREATE INDEX [IX_DeliveryZoneAreas_DeliveryZoneId] ON [DeliveryZoneAreas] ([DeliveryZoneId]);
END
""");

        if (!await db.DeliveryZones.AnyAsync())
        {
            await SeedDefaultZonesAsync();
        }
    }

    public async Task<IReadOnlyList<DeliveryZoneDto>> GetAllAsync(bool activeOnly)
    {
        var query = db.DeliveryZones.AsNoTracking().Include(zone => zone.Areas).AsQueryable();
        if (activeOnly)
        {
            query = query.Where(zone => zone.IsActive);
        }

        var zones = await query
            .OrderBy(zone => zone.SortOrder)
            .ThenBy(zone => zone.Name)
            .ToListAsync();

        return zones.Select(zone => ToDto(zone, activeOnly)).ToList();
    }

    public async Task<DeliveryZoneDto> CreateAsync(UpsertDeliveryZoneRequest request)
    {
        var now = DateTimeOffset.UtcNow;
        var zone = new DeliveryZoneEntity
        {
            Id = $"zone_{Guid.NewGuid():N}",
            CreatedAt = now
        };
        Apply(zone, request, now);
        db.DeliveryZones.Add(zone);
        await db.SaveChangesAsync();
        return ToDto(zone, false);
    }

    public async Task<DeliveryZoneDto?> UpdateAsync(string id, UpsertDeliveryZoneRequest request)
    {
        var zone = await db.DeliveryZones.Include(item => item.Areas).FirstOrDefaultAsync(item => item.Id == id);
        if (zone is null)
        {
            return null;
        }

        Apply(zone, request, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync();
        return ToDto(zone, false);
    }

    public async Task<bool> DeleteAsync(string id)
    {
        var zone = await db.DeliveryZones.Include(item => item.Areas).FirstOrDefaultAsync(item => item.Id == id);
        if (zone is null)
        {
            return false;
        }

        db.DeliveryZones.Remove(zone);
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<ResolvedDelivery> ResolveAsync(string zoneId, string? areaId, bool requireActive = true)
    {
        if (string.IsNullOrWhiteSpace(zoneId))
        {
            throw new InvalidOperationException("Please select a delivery area.");
        }

        var zone = await db.DeliveryZones
            .AsNoTracking()
            .Include(item => item.Areas)
            .FirstOrDefaultAsync(item => item.Id == zoneId);

        if (zone is null)
        {
            throw new InvalidOperationException("The selected delivery area is not supported.");
        }

        if (requireActive && !zone.IsActive)
        {
            throw new InvalidOperationException("This delivery area is currently unavailable. Please choose another area.");
        }

        var activeAreas = zone.Areas
            .Where(area => area.IsActive)
            .OrderBy(area => area.SortOrder)
            .ThenBy(area => area.Name)
            .ToList();

        DeliveryZoneAreaEntity? area = null;
        if (!string.IsNullOrWhiteSpace(areaId))
        {
            area = activeAreas.FirstOrDefault(item => item.Id == areaId);
            if (area is null)
            {
                throw new InvalidOperationException("The selected delivery neighborhood is not available.");
            }
        }
        else if (activeAreas.Count > 0 && !IsFixed(zone.PricingType))
        {
            throw new InvalidOperationException("Please select the specific area within this delivery zone.");
        }

        return new ResolvedDelivery(zone, area, ResolveFee(zone, area), Math.Max(1, zone.EstimatedDays));
    }

    private static decimal ResolveFee(DeliveryZoneEntity zone, DeliveryZoneAreaEntity? area)
    {
        if (area is not null)
        {
            return Math.Round(area.Fee, 2);
        }

        if (IsFixed(zone.PricingType))
        {
            var fixedFee = zone.FixedFee > 0 ? zone.FixedFee : zone.DefaultFee;
            return Math.Round(fixedFee, 2);
        }

        var fallback = zone.DefaultFee > 0 ? zone.DefaultFee : zone.MinFee;
        if (zone.MinFee > 0 && fallback < zone.MinFee) fallback = zone.MinFee;
        if (zone.MaxFee > 0 && fallback > zone.MaxFee) fallback = zone.MaxFee;
        return Math.Round(fallback, 2);
    }

    private void Apply(DeliveryZoneEntity zone, UpsertDeliveryZoneRequest request, DateTimeOffset now)
    {
        var name = request.Name?.Trim() ?? string.Empty;
        var city = request.CityRegion?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(city))
        {
            throw new InvalidOperationException("Zone name and city / region are required.");
        }

        var pricingType = NormalizePricingType(request.PricingType);
        var minFee = Math.Round(Math.Max(0, request.MinFee), 2);
        var maxFee = Math.Round(Math.Max(0, request.MaxFee), 2);
        var fixedFee = Math.Round(Math.Max(0, request.FixedFee), 2);
        var defaultFee = Math.Round(Math.Max(0, request.DefaultFee), 2);

        if (IsFixed(pricingType))
        {
            if (fixedFee <= 0 && defaultFee <= 0)
            {
                throw new InvalidOperationException("A fixed delivery fee is required for this zone.");
            }

            if (fixedFee <= 0)
            {
                fixedFee = defaultFee;
            }

            minFee = fixedFee;
            maxFee = fixedFee;
            defaultFee = fixedFee;
        }
        else
        {
            if (minFee <= 0 || maxFee <= 0 || maxFee < minFee)
            {
                throw new InvalidOperationException("Range pricing requires a valid minimum and maximum delivery fee.");
            }

            if (defaultFee <= 0)
            {
                defaultFee = minFee;
            }

            if (defaultFee < minFee || defaultFee > maxFee)
            {
                throw new InvalidOperationException("The default delivery fee must be between the minimum and maximum.");
            }
        }

        zone.Name = name;
        zone.CityRegion = city;
        zone.PricingType = pricingType;
        zone.MinFee = minFee;
        zone.MaxFee = maxFee;
        zone.FixedFee = fixedFee;
        zone.DefaultFee = defaultFee;
        zone.EstimatedDays = request.EstimatedDays > 0 ? request.EstimatedDays : 3;
        zone.SortOrder = request.SortOrder;
        zone.IsActive = request.IsActive;
        zone.UpdatedAt = now;

        var incoming = request.Areas ?? [];
        var keepIds = incoming
            .Select(area => area.Id)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToHashSet(StringComparer.Ordinal);

        zone.Areas.RemoveAll(area => !keepIds.Contains(area.Id));

        var sort = 0;
        foreach (var input in incoming)
        {
            var areaName = input.Name?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(areaName))
            {
                throw new InvalidOperationException("Each delivery area needs a name.");
            }

            var fee = Math.Round(Math.Max(0, input.Fee), 2);
            if (fee <= 0)
            {
                throw new InvalidOperationException($"A delivery fee is required for {areaName}.");
            }

            if (!IsFixed(pricingType) && (fee < minFee || fee > maxFee))
            {
                throw new InvalidOperationException($"{areaName} fee must be between {minFee:0.##} and {maxFee:0.##} EGP.");
            }

            DeliveryZoneAreaEntity area;
            if (!string.IsNullOrWhiteSpace(input.Id))
            {
                area = zone.Areas.FirstOrDefault(item => item.Id == input.Id)
                    ?? throw new InvalidOperationException("A delivery area could not be updated because it was not found.");
            }
            else
            {
                area = new DeliveryZoneAreaEntity
                {
                    Id = $"area_{Guid.NewGuid():N}",
                    DeliveryZoneId = zone.Id
                };
                zone.Areas.Add(area);
            }

            area.Name = areaName;
            area.Fee = fee;
            area.SortOrder = input.SortOrder != 0 ? input.SortOrder : sort;
            area.IsActive = input.IsActive;
            sort++;
        }
    }

    private async Task SeedDefaultZonesAsync()
    {
        var now = DateTimeOffset.UtcNow;
        var alexandria = NewZone("zone_alexandria", "Alexandria", "Alexandria", "range", 40, 50, 0, 45, 3, 1, now);
        alexandria.Areas.AddRange([
            NewArea(alexandria.Id, "Nearby Alexandria", 40, 1),
            NewArea(alexandria.Id, "Medium-distance Alexandria", 45, 2),
            NewArea(alexandria.Id, "Farther Alexandria", 50, 3)
        ]);

        var cairo = NewZone("zone_cairo", "Cairo and Surrounding Areas", "Cairo / Giza", "range", 80, 90, 0, 85, 2, 2, now);
        cairo.Areas.AddRange([
            NewArea(cairo.Id, "Nearby Cairo / Giza", 80, 1),
            NewArea(cairo.Id, "Medium-distance Cairo area", 85, 2),
            NewArea(cairo.Id, "Farther Cairo surroundings", 90, 3)
        ]);

        var upper = NewZone("zone_upper_egypt_near", "Areas Near Upper Egypt", "Upper Egypt / farther governorates", "fixed", 100, 100, 100, 100, 4, 3, now);

        db.DeliveryZones.AddRange(alexandria, cairo, upper);
        await db.SaveChangesAsync();
    }

    private static DeliveryZoneEntity NewZone(
        string id,
        string name,
        string city,
        string pricingType,
        decimal min,
        decimal max,
        decimal fixedFee,
        decimal defaultFee,
        int days,
        int sort,
        DateTimeOffset now) => new()
    {
        Id = id,
        Name = name,
        CityRegion = city,
        PricingType = pricingType,
        MinFee = min,
        MaxFee = max,
        FixedFee = fixedFee,
        DefaultFee = defaultFee,
        EstimatedDays = days,
        SortOrder = sort,
        IsActive = true,
        CreatedAt = now,
        UpdatedAt = now
    };

    private static DeliveryZoneAreaEntity NewArea(string zoneId, string name, decimal fee, int sort) => new()
    {
        Id = $"area_{Guid.NewGuid():N}",
        DeliveryZoneId = zoneId,
        Name = name,
        Fee = fee,
        SortOrder = sort,
        IsActive = true
    };

    private static string NormalizePricingType(string? value)
    {
        var cleaned = value?.Trim().ToLowerInvariant();
        return cleaned is "range" or "distance" ? cleaned : "fixed";
    }

    private static bool IsFixed(string pricingType) =>
        pricingType.Equals("fixed", StringComparison.OrdinalIgnoreCase);

    private static DeliveryZoneDto ToDto(DeliveryZoneEntity zone, bool activeAreasOnly)
    {
        var areas = (zone.Areas ?? [])
            .Where(area => !activeAreasOnly || area.IsActive)
            .OrderBy(area => area.SortOrder)
            .ThenBy(area => area.Name)
            .Select(area => new DeliveryZoneAreaDto(area.Id, area.Name, area.Fee, area.SortOrder, area.IsActive))
            .ToList();

        return new DeliveryZoneDto(
            zone.Id,
            zone.Name,
            zone.CityRegion,
            zone.MinFee,
            zone.MaxFee,
            zone.FixedFee,
            zone.DefaultFee,
            zone.PricingType,
            zone.EstimatedDays,
            zone.SortOrder,
            zone.IsActive,
            zone.CreatedAt,
            zone.UpdatedAt,
            areas);
    }
}

public sealed record ResolvedDelivery(
    DeliveryZoneEntity Zone,
    DeliveryZoneAreaEntity? Area,
    decimal Fee,
    int EstimatedDays);
