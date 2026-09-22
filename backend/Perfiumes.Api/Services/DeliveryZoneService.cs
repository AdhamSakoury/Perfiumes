using System.Net.Http.Json;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class DeliveryZoneService(PerfiumesDbContext db, IHttpClientFactory httpFactory)
{
    // Reverse geocoding is an external, rate-limited service. Cache a small rounded
    // coordinate cell briefly so retries and nearby fixes do not repeat the request.
    private static readonly ConcurrentDictionary<string, CachedReverseGeocode> ReverseGeocodeCache = new();
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

        // Upgrade only the original seeded catch-all wording. It is used for places
        // such as Mansoura and Tanta, so "Areas Near Upper Egypt" is misleading.
        var legacyCatchAll = await db.DeliveryZones.FirstOrDefaultAsync(zone =>
            zone.Id == "zone_upper_egypt_near"
            && zone.Name == "Areas Near Upper Egypt"
            && zone.CityRegion == "Upper Egypt / farther governorates");
        if (legacyCatchAll is not null)
        {
            legacyCatchAll.Name = "Other Egyptian Governorates";
            legacyCatchAll.CityRegion = "Egyptian governorates outside Cairo / Alexandria";
            legacyCatchAll.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
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

    public async Task<DetectedLocationDto> DetectLocationAsync(DetectLocationRequest request, CancellationToken cancellationToken = default)
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
                var resolved = await ReverseGeocodeAsync(lat.Value, lon.Value, cancellationToken, request.Language);
                formattedAddress = string.IsNullOrWhiteSpace(resolved.FormattedAddress) ? formattedAddress : resolved.FormattedAddress;
                city = resolved.City;
                state = resolved.State;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch
            {
                // Fallback to coordinates-based region detection
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.Address) && !string.IsNullOrWhiteSpace(request.Language))
        {
            // No GPS coordinates â€” caller wants the address in a specific language
            // (e.g. user saved an Arabic address, site switched to English).
            // Forward-geocode the text to get coordinates, then reverse-geocode in the right language.
            try
            {
                var coords = await ForwardGeocodeAsync(request.Address, cancellationToken);
                if (coords.HasValue)
                {
                    lat = coords.Value.Lat;
                    lon = coords.Value.Lon;
                    var resolved = await ReverseGeocodeAsync(lat.Value, lon.Value, cancellationToken, request.Language);
                    if (!string.IsNullOrWhiteSpace(resolved.FormattedAddress))
                        formattedAddress = resolved.FormattedAddress;
                    city = resolved.City;
                    state = resolved.State;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch
            {
                // Keep original address text on failure
            }
        }

        DeliveryZoneEntity? matchedZone = null;
        DeliveryZoneAreaEntity? matchedArea = null;

        var normalizedText = NormalizeLocationText($"{formattedAddress} {city} {state} {request.Address}");
        var governorate = InferGovernorate(normalizedText);
        if (string.IsNullOrWhiteSpace(governorate) && lat.HasValue && lon.HasValue)
        {
            governorate = InferGovernorateFromCoordinates(lat.Value, lon.Value);
        }

        // Configuration is the first source of truth: zones and their areas can be
        // named by the administrator in Arabic or English without code changes.
        matchedZone = FindConfiguredZone(allZones, normalizedText, governorate);
        if (matchedZone is not null)
        {
            matchedArea = FindConfiguredArea(matchedZone, normalizedText);
            matchedArea ??= SelectAreaByDistance(matchedZone, lat, lon);
            matchedArea ??= DefaultArea(matchedZone);
        }

        // A known Egyptian governorate without its own configured zone uses the
        // existing catch-all zone. This preserves existing delivery pricing rules.
        matchedZone ??= allZones.FirstOrDefault(z =>
            z.CityRegion.Contains("Upper Egypt", StringComparison.OrdinalIgnoreCase) ||
            z.CityRegion.Contains("governorate", StringComparison.OrdinalIgnoreCase) ||
            z.CityRegion.Contains("المحافظات", StringComparison.OrdinalIgnoreCase) ||
            z.CityRegion.Contains("خارج", StringComparison.OrdinalIgnoreCase) ||
            z.Name.Contains("Upper Egypt", StringComparison.OrdinalIgnoreCase) ||
            z.Id == "zone_upper_egypt_near");
        matchedZone ??= allZones.LastOrDefault();
        matchedArea ??= matchedZone is null ? null : DefaultArea(matchedZone);

        matchedZone ??= allZones[0];

        decimal fee = ResolveFee(matchedZone, matchedArea);
        int days = Math.Max(1, matchedZone.EstimatedDays);

        return new DetectedLocationDto(
            Success: true,
            FormattedAddress: string.IsNullOrWhiteSpace(formattedAddress) ? (request.Address ?? string.Empty) : formattedAddress,
            City: !string.IsNullOrWhiteSpace(city) ? city : (!string.IsNullOrWhiteSpace(state) ? state : matchedZone.CityRegion),
            Governorate: !string.IsNullOrWhiteSpace(state) ? state : (!string.IsNullOrWhiteSpace(governorate) ? governorate : matchedZone.CityRegion),
            ZoneId: matchedZone.Id,
            ZoneName: matchedZone.Name,
            AreaId: matchedArea?.Id,
            AreaName: matchedArea?.Name,
            ShippingFee: fee,
            EstimatedDays: days,
            Message: "Delivery zone detected successfully.");
    }

    private static DeliveryZoneEntity? FindConfiguredZone(
        IEnumerable<DeliveryZoneEntity> zones,
        string text,
        string governorate)
    {
        return zones
            .Select(zone => new { Zone = zone, Score = ZoneMatchScore(zone, text, governorate) })
            .Where(candidate => candidate.Score > 0)
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Zone.SortOrder)
            .Select(candidate => candidate.Zone)
            .FirstOrDefault();
    }

    private async Task<CachedReverseGeocode> ReverseGeocodeAsync(double latitude, double longitude, CancellationToken cancellationToken, string? language = null)
    {
        var lang = string.IsNullOrWhiteSpace(language) ? "en" : language.Trim().ToLowerInvariant();
        var cacheKey = $"{Math.Round(latitude, 4):F4}:{Math.Round(longitude, 4):F4}:{lang}";
        if (ReverseGeocodeCache.TryGetValue(cacheKey, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow)
        {
            return cached;
        }

        var client = httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(3);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("GnoubyPerfumes/1.0 (support@gnouby.com)");
        var lat = latitude.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var lon = longitude.ToString(System.Globalization.CultureInfo.InvariantCulture);
        // Use the site language for the reverse-geocoded display_name.
        // Nominatim honours the accept-language header for both display_name and
        // the individual address components it returns.
        var acceptLang = lang == "ar" ? "ar,en" : "en,ar";
        var response = await client.GetFromJsonAsync<System.Text.Json.JsonElement>(
            $"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&accept-language={acceptLang}", cancellationToken);

        var formattedAddress = response.TryGetProperty("display_name", out var displayName) ? displayName.GetString() ?? string.Empty : string.Empty;
        var city = string.Empty;
        var state = string.Empty;
        if (response.TryGetProperty("address", out var address) && address.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            state = GetStringProp(address, "state") ?? GetStringProp(address, "governorate") ?? string.Empty;
            city = GetStringProp(address, "city") ?? GetStringProp(address, "town") ?? GetStringProp(address, "village")
                ?? GetStringProp(address, "county") ?? GetStringProp(address, "suburb") ?? string.Empty;
            var road = GetStringProp(address, "road") ?? GetStringProp(address, "street") ?? string.Empty;
            var separator = lang == "ar" ? "، " : ", ";
            var parts = new[] { road, city, state }.Where(part => !string.IsNullOrWhiteSpace(part));
            formattedAddress = parts.Any() ? string.Join(separator, parts) : formattedAddress;
        }

        var resolved = new CachedReverseGeocode(formattedAddress, city, state, DateTimeOffset.UtcNow.AddMinutes(3));
        ReverseGeocodeCache[cacheKey] = resolved;
        return resolved;
    }

    private static int ZoneMatchScore(DeliveryZoneEntity zone, string text, string governorate)
    {
        var profile = NormalizeLocationText($"{zone.Name} {zone.CityRegion}");
        var score = 0;

        // Prefer administrator-configured zone and area names over the built-in
        // governorate dictionary, so custom delivery zones remain authoritative.
        if (ContainsPhrase(text, NormalizeLocationText(zone.CityRegion))) score += 80;
        if (ContainsPhrase(text, NormalizeLocationText(zone.Name))) score += 70;
        if (zone.Areas.Any(area => area.IsActive && ContainsPhrase(text, NormalizeLocationText(area.Name)))) score += 100;

        if (!string.IsNullOrWhiteSpace(governorate))
        {
            score += GovernorateAliases(governorate)
                .Where(alias => ContainsPhrase(profile, NormalizeLocationText(alias)))
                .Any() ? 60 : 0;
        }

        return score;
    }

    private static DeliveryZoneAreaEntity? FindConfiguredArea(DeliveryZoneEntity zone, string text) =>
        zone.Areas
            .Where(area => area.IsActive && ContainsPhrase(text, NormalizeLocationText(area.Name)))
            .OrderByDescending(area => NormalizeLocationText(area.Name).Length)
            .ThenBy(area => area.SortOrder)
            .FirstOrDefault();

    private static DeliveryZoneAreaEntity? SelectAreaByDistance(DeliveryZoneEntity zone, double? lat, double? lon)
    {
        var areas = zone.Areas.Where(area => area.IsActive).OrderBy(area => area.SortOrder).ToList();
        if (!lat.HasValue || !lon.HasValue || areas.Count == 0) return null;

        var profile = NormalizeLocationText($"{zone.Name} {zone.CityRegion}");
        if (ContainsPhrase(profile, "alexandria") || ContainsPhrase(profile, "الاسكندرية"))
        {
            var distance = HaversineDistance(lat.Value, lon.Value, 31.2001, 29.9187);
            return distance <= 12 ? areas[0] : distance <= 25 && areas.Count > 1 ? areas[1] : areas.Last();
        }

        if (ContainsPhrase(profile, "cairo") || ContainsPhrase(profile, "القاهرة"))
        {
            var distance = HaversineDistance(lat.Value, lon.Value, 30.0444, 31.2357);
            return distance <= 15 ? areas[0] : distance <= 30 && areas.Count > 1 ? areas[1] : areas.Last();
        }

        return null;
    }

    private static DeliveryZoneAreaEntity? DefaultArea(DeliveryZoneEntity zone) =>
        zone.Areas.Where(area => area.IsActive).OrderBy(area => area.SortOrder)
            .FirstOrDefault(area => area.Fee == zone.DefaultFee)
        ?? zone.Areas.Where(area => area.IsActive).OrderBy(area => area.SortOrder).FirstOrDefault();

    private static string InferGovernorateFromCoordinates(double lat, double lon)
    {
        if (lat is >= 31.0 and <= 31.45 && lon is >= 29.5 and <= 30.35) return "Alexandria";
        return HaversineDistance(lat, lon, 30.0444, 31.2357) <= 45 ? "Cairo" : string.Empty;
    }

    private static string InferGovernorate(string text)
    {
        foreach (var (governorate, aliases) in EgyptianGovernorateAliases)
        {
            if (aliases.Any(alias => ContainsPhrase(text, NormalizeLocationText(alias)))) return governorate;
        }
        return string.Empty;
    }

    private static IEnumerable<string> GovernorateAliases(string governorate) =>
        EgyptianGovernorateAliases.TryGetValue(governorate, out var aliases) ? aliases : [governorate];

    private static bool ContainsPhrase(string text, string phrase)
    {
        if (string.IsNullOrWhiteSpace(phrase) || phrase.Length < 3) return false;
        return $" {text} ".Contains($" {phrase} ", StringComparison.Ordinal)
            || phrase.Contains(' ') && text.Contains(phrase, StringComparison.Ordinal);
    }

    private static string NormalizeLocationText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var decomposed = value.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD) ?? string.Empty;
        var filtered = new string(decomposed.Where(ch => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray());
        var sanitized = new string((filtered ?? string.Empty)
            .Replace('أ', 'ا').Replace('إ', 'ا').Replace('آ', 'ا').Replace('ى', 'ي').Replace('ة', 'ه')
            .Select(ch => char.IsLetterOrDigit(ch) || char.IsWhiteSpace(ch) ? ch : ' ')
            .ToArray());
        return string.Join(' ', sanitized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    private static readonly IReadOnlyDictionary<string, string[]> EgyptianGovernorateAliases =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["Alexandria"] = ["alexandria", "alex", "الاسكندرية", "اسكندرية", "سيدي بشر", "سيدي بشير", "sidi bishr", "sidi beshr", "agami", "el agamy", "العجمي", "العجمى", "العامرية", "amreya", "miami", "ميامي", "سموحة", "smoha", "محرم بك", "moharam bek", "الرمل", "العصافرة", "abu qir", "ابو قير", "برج العرب", "الدخيلة", "كرموز"],
            ["Cairo"] = ["cairo", "القاهرة", "nasr city", "مدينة نصر", "heliopolis", "مصر الجديدة", "maadi", "المعادي", "zamalek", "الزمالك", "shorouk", "الشروق", "obour", "العبور", "badr", "بدر", "tagamoa", "التجمع", "new cairo", "القاهرة الجديدة", "helwan", "حلوان"],
            ["Giza"] = ["giza", "الجيزة", "جيزة", "dokki", "الدقي", "mohandessin", "المهندسين", "6 october", "sixth of october", "٦ اكتوبر", "6 اكتوبر", "sheikh zayed", "الشيخ زايد", "haram", "الهرم", "faisal", "فيصل"],
            ["Qalyubia"] = ["qalyubia", "qalyoubia", "القليوبية", "قليوب", "shubra", "شبرا"],
            ["Dakahlia"] = ["dakahlia", "الدقهلية", "mansoura", "المنصورة"],
            ["Gharbia"] = ["gharbia", "الغربية", "tanta", "طنطا", "mahalla", "المحلة"],
            ["Sharqia"] = ["sharqia", "الشرقية", "zagazig", "الزقازيق"],
            ["Monufia"] = ["monufia", "menoufia", "المنوفية", "shebin el kom", "شبين الكوم"],
            ["Beheira"] = ["beheira", "البحيرة", "damanhur", "دمنهور"],
            ["Ismailia"] = ["ismailia", "الاسماعيلية", "الإسماعيلية"],
            ["Suez"] = ["suez", "السويس"], ["Port Said"] = ["port said", "بورسعيد"],
            ["Red Sea"] = ["red sea", "البحر الاحمر", "الغردقة", "hurghada"],
            ["Fayoum"] = ["fayoum", "fayum", "الفيوم"], ["Beni Suef"] = ["beni suef", "بني سويف"],
            ["Minya"] = ["minya", "المنيا"], ["Assiut"] = ["assiut", "asyut", "اسيوط", "أسيوط"],
            ["Sohag"] = ["sohag", "سوهاج"], ["Qena"] = ["qena", "قنا"], ["Luxor"] = ["luxor", "الاقصر", "الأقصر"],
            ["Aswan"] = ["aswan", "اسوان", "أسوان"], ["Matrouh"] = ["matrouh", "مطروح", "marsah matrouh", "مرسى مطروح"],
            ["North Sinai"] = ["north sinai", "شمال سيناء", "العريش"], ["South Sinai"] = ["south sinai", "جنوب سيناء", "شرم الشيخ"],
            ["New Valley"] = ["new valley", "الوادي الجديد"], ["Kafr El Sheikh"] = ["kafr el sheikh", "كفر الشيخ"],
            ["Damietta"] = ["damietta", "دمياط"]
        };

    private static string? GetStringProp(System.Text.Json.JsonElement elem, string prop)
    {
        return elem.TryGetProperty(prop, out var val) && val.ValueKind == System.Text.Json.JsonValueKind.String
            ? val.GetString()
            : null;
    }

    private sealed record CachedReverseGeocode(string FormattedAddress, string City, string State, DateTimeOffset ExpiresAt);
    private sealed record CachedForwardGeocode(double Lat, double Lon, DateTimeOffset ExpiresAt);

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, CachedForwardGeocode>
        ForwardGeocodeCache = new();

    private async Task<(double Lat, double Lon)?> ForwardGeocodeAsync(string address, CancellationToken cancellationToken)
    {
        var cacheKey = address.Trim().ToLowerInvariant();
        if (ForwardGeocodeCache.TryGetValue(cacheKey, out var cached) && cached.ExpiresAt > DateTimeOffset.UtcNow)
            return (cached.Lat, cached.Lon);

        var client = httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(4);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("GnoubyPerfumes/1.0 (support@gnouby.com)");
        var encoded = Uri.EscapeDataString(address.Trim());
        var response = await client.GetFromJsonAsync<System.Text.Json.JsonElement[]>(
            $"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1&countrycodes=eg",
            cancellationToken);

        if (response is null || response.Length == 0) return null;
        var first = response[0];
        if (!first.TryGetProperty("lat", out var latEl) || !first.TryGetProperty("lon", out var lonEl)) return null;
        if (!double.TryParse(latEl.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var lat)) return null;
        if (!double.TryParse(lonEl.GetString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var lon)) return null;

        ForwardGeocodeCache[cacheKey] = new CachedForwardGeocode(lat, lon, DateTimeOffset.UtcNow.AddHours(6));
        return (lat, lon);
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

        var upper = NewZone("zone_upper_egypt_near", "Other Egyptian Governorates", "Egyptian governorates outside Cairo / Alexandria", "fixed", 100, 100, 100, 100, 4, 3, now);

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
