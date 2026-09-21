using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class DeliveryZoneService(PerfiumesDbContext db, IHttpClientFactory httpFactory)
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
        DeliveryZoneEntity? zone = null;
        if (!string.IsNullOrWhiteSpace(zoneId))
        {
            zone = await db.DeliveryZones
                .AsNoTracking()
                .Include(item => item.Areas)
                .FirstOrDefaultAsync(item => item.Id == zoneId);
        }

        if (zone is null || (requireActive && !zone.IsActive))
        {
            zone = await db.DeliveryZones
                .AsNoTracking()
                .Include(item => item.Areas)
                .Where(z => !requireActive || z.IsActive)
                .OrderBy(z => z.SortOrder)
                .FirstOrDefaultAsync();

            if (zone is null)
            {
                throw new InvalidOperationException("No delivery zones are currently configured.");
            }
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
        }

        if (area is null && activeAreas.Count > 0)
        {
            area = activeAreas.FirstOrDefault(a => a.Fee == zone.DefaultFee) ?? activeAreas[0];
        }

        return new ResolvedDelivery(zone, area, ResolveFee(zone, area), Math.Max(1, zone.EstimatedDays));
    }

    public async Task<DetectedLocationDto> DetectLocationAsync(DetectLocationRequest request)
    {
        var allZones = await db.DeliveryZones
            .AsNoTracking()
            .Include(z => z.Areas)
            .Where(z => z.IsActive)
            .OrderBy(z => z.SortOrder)
            .ToListAsync();

        if (allZones.Count == 0)
        {
            return new DetectedLocationDto(
                Success: false,
                FormattedAddress: request.Address ?? string.Empty,
                City: string.Empty,
                Governorate: string.Empty,
                ZoneId: string.Empty,
                ZoneName: string.Empty,
                AreaId: null,
                AreaName: null,
                ShippingFee: 0,
                EstimatedDays: 3,
                Message: "No delivery zones are configured.");
        }

        double? lat = request.Latitude;
        double? lon = request.Longitude;
        string formattedAddress = request.Address?.Trim() ?? string.Empty;
        string state = string.Empty;
        string city = string.Empty;

        if (lat.HasValue && lon.HasValue && Math.Abs(lat.Value) > 0.001)
        {
            try
            {
                var client = httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);
                client.DefaultRequestHeaders.UserAgent.ParseAdd("GnoubyPerfumes/1.0 (support@gnouby.com)");

                var latStr = lat.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var lonStr = lon.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var url = $"https://nominatim.openstreetmap.org/reverse?lat={latStr}&lon={lonStr}&format=json&accept-language=ar,en";
                var response = await client.GetFromJsonAsync<System.Text.Json.JsonElement>(url);

                if (response.ValueKind == System.Text.Json.JsonValueKind.Object)
                {
                    if (response.TryGetProperty("display_name", out var dn))
                    {
                        formattedAddress = dn.GetString() ?? formattedAddress;
                    }

                    if (response.TryGetProperty("address", out var addrElem) && addrElem.ValueKind == System.Text.Json.JsonValueKind.Object)
                    {
                        state = GetStringProp(addrElem, "state")
                             ?? GetStringProp(addrElem, "governorate")
                             ?? string.Empty;

                        city = GetStringProp(addrElem, "city")
                            ?? GetStringProp(addrElem, "town")
                            ?? GetStringProp(addrElem, "village")
                            ?? GetStringProp(addrElem, "county")
                            ?? GetStringProp(addrElem, "suburb")
                            ?? string.Empty;

                        var road = GetStringProp(addrElem, "road")
                                ?? GetStringProp(addrElem, "street")
                                ?? string.Empty;

                        var parts = new List<string>();
                        if (!string.IsNullOrWhiteSpace(road)) parts.Add(road);
                        if (!string.IsNullOrWhiteSpace(city)) parts.Add(city);
                        if (!string.IsNullOrWhiteSpace(state)) parts.Add(state);

                        if (parts.Count > 0)
                        {
                            formattedAddress = string.Join("، ", parts);
                        }
                    }
                }
            }
            catch
            {
                // Fallback to coordinates-based region detection
            }
        }

        DeliveryZoneEntity? matchedZone = null;
        DeliveryZoneAreaEntity? matchedArea = null;

        var textToMatch = $"{formattedAddress} {city} {state} {request.Address}".ToLowerInvariant();

        // 1. Check Alexandria:
        bool isAlex = textToMatch.Contains("alex") || textToMatch.Contains("اسكندر") || textToMatch.Contains("إسكندر");
        if (!isAlex && lat.HasValue && lon.HasValue)
        {
            isAlex = lat.Value >= 31.0 && lat.Value <= 31.45 && lon.Value >= 29.5 && lon.Value <= 30.35;
        }

        // 2. Check Greater Cairo:
        bool isCairo = textToMatch.Contains("cairo") || textToMatch.Contains("giza") || textToMatch.Contains("قاهر") ||
                       textToMatch.Contains("جيز") || textToMatch.Contains("قليوب") || textToMatch.Contains("أكتوبر") ||
                       textToMatch.Contains("زايد") || textToMatch.Contains("تجمع") || textToMatch.Contains("معادي") ||
                       textToMatch.Contains("شروق") || textToMatch.Contains("عبور") || textToMatch.Contains("بدر");
        if (!isCairo && lat.HasValue && lon.HasValue && !isAlex)
        {
            var distToCairo = HaversineDistance(lat.Value, lon.Value, 30.0444, 31.2357);
            isCairo = distToCairo <= 45;
        }

        if (isAlex)
        {
            matchedZone = allZones.FirstOrDefault(z => z.Name.Contains("Alex", StringComparison.OrdinalIgnoreCase) ||
                                                       z.CityRegion.Contains("Alex", StringComparison.OrdinalIgnoreCase) ||
                                                       z.Id == "zone_alexandria");
            if (matchedZone is not null && matchedZone.Areas.Count > 0)
            {
                var activeAreas = matchedZone.Areas.Where(a => a.IsActive).OrderBy(a => a.SortOrder).ToList();
                if (lat.HasValue && lon.HasValue)
                {
                    var dist = HaversineDistance(lat.Value, lon.Value, 31.2001, 29.9187);
                    if (dist <= 12 && activeAreas.Count > 0) matchedArea = activeAreas[0];
                    else if (dist <= 25 && activeAreas.Count > 1) matchedArea = activeAreas[1];
                    else if (activeAreas.Count > 2) matchedArea = activeAreas[2];
                    else matchedArea = activeAreas.LastOrDefault();
                }
                matchedArea ??= activeAreas.FirstOrDefault(a => a.Fee == matchedZone.DefaultFee) ?? activeAreas.FirstOrDefault();
            }
        }
        else if (isCairo)
        {
            matchedZone = allZones.FirstOrDefault(z => z.Name.Contains("Cairo", StringComparison.OrdinalIgnoreCase) ||
                                                       z.CityRegion.Contains("Cairo", StringComparison.OrdinalIgnoreCase) ||
                                                       z.Id == "zone_cairo");
            if (matchedZone is not null && matchedZone.Areas.Count > 0)
            {
                var activeAreas = matchedZone.Areas.Where(a => a.IsActive).OrderBy(a => a.SortOrder).ToList();
                if (lat.HasValue && lon.HasValue)
                {
                    var dist = HaversineDistance(lat.Value, lon.Value, 30.0444, 31.2357);
                    if (dist <= 15 && activeAreas.Count > 0) matchedArea = activeAreas[0];
                    else if (dist <= 30 && activeAreas.Count > 1) matchedArea = activeAreas[1];
                    else if (activeAreas.Count > 2) matchedArea = activeAreas[2];
                    else matchedArea = activeAreas.LastOrDefault();
                }
                matchedArea ??= activeAreas.FirstOrDefault(a => a.Fee == matchedZone.DefaultFee) ?? activeAreas.FirstOrDefault();
            }
        }
        else
        {
            // 3. Location is OUTSIDE Cairo & Alexandria (Mansoura, Tanta, Upper Egypt, Canal, etc.)
            matchedZone = allZones.FirstOrDefault(z =>
                (!string.IsNullOrWhiteSpace(city) && (z.Name.Contains(city, StringComparison.OrdinalIgnoreCase) || z.CityRegion.Contains(city, StringComparison.OrdinalIgnoreCase))) ||
                (!string.IsNullOrWhiteSpace(state) && (z.Name.Contains(state, StringComparison.OrdinalIgnoreCase) || z.CityRegion.Contains(state, StringComparison.OrdinalIgnoreCase))));

            matchedZone ??= allZones.FirstOrDefault(z =>
                z.CityRegion.Contains("Upper Egypt", StringComparison.OrdinalIgnoreCase) ||
                z.CityRegion.Contains("governorate", StringComparison.OrdinalIgnoreCase) ||
                z.CityRegion.Contains("المحافظات", StringComparison.OrdinalIgnoreCase) ||
                z.CityRegion.Contains("خارج", StringComparison.OrdinalIgnoreCase) ||
                z.Name.Contains("Upper Egypt", StringComparison.OrdinalIgnoreCase) ||
                z.Id == "zone_upper_egypt_near");

            matchedZone ??= allZones.LastOrDefault();

            if (matchedZone is not null && matchedZone.Areas.Count > 0)
            {
                var activeAreas = matchedZone.Areas.Where(a => a.IsActive).OrderBy(a => a.SortOrder).ToList();
                matchedArea = activeAreas.FirstOrDefault(a => a.Fee == matchedZone.DefaultFee) ?? activeAreas.FirstOrDefault();
            }
        }

        matchedZone ??= allZones[0];

        decimal fee = ResolveFee(matchedZone, matchedArea);
        int days = Math.Max(1, matchedZone.EstimatedDays);

        return new DetectedLocationDto(
            Success: true,
            FormattedAddress: string.IsNullOrWhiteSpace(formattedAddress) ? (request.Address ?? string.Empty) : formattedAddress,
            City: !string.IsNullOrWhiteSpace(city) ? city : (!string.IsNullOrWhiteSpace(state) ? state : matchedZone.CityRegion),
            Governorate: !string.IsNullOrWhiteSpace(state) ? state : matchedZone.CityRegion,
            ZoneId: matchedZone.Id,
            ZoneName: matchedZone.Name,
            AreaId: matchedArea?.Id,
            AreaName: matchedArea?.Name,
            ShippingFee: fee,
            EstimatedDays: days,
            Message: "Delivery zone detected successfully.");
    }

    private static string? GetStringProp(System.Text.Json.JsonElement elem, string prop)
    {
        return elem.TryGetProperty(prop, out var val) && val.ValueKind == System.Text.Json.JsonValueKind.String
            ? val.GetString()
            : null;
    }

    private static double HaversineDistance(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 6371; // Earth radius in km
        var dLat = (lat2 - lat1) * Math.PI / 180.0;
        var dLon = (lon2 - lon1) * Math.PI / 180.0;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return R * c;
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
