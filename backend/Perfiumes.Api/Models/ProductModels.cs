namespace Perfiumes.Api.Models;

public sealed record Product(
    int Id,
    string Name,
    string Brand,
    decimal Price,
    decimal Rating,
    string Gender,
    string Image,
    string Description,
    string Category,
    IReadOnlyList<string> Notes,
    string Concentration,
    IReadOnlyList<string> Season,
    int StockQuantity,
    bool IsFeatured,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ProductCreateRequest(
    string Name,
    string Brand,
    decimal Price,
    decimal Rating,
    string Gender,
    string Image,
    string Description,
    string Category,
    IReadOnlyList<string>? Notes,
    string Concentration,
    IReadOnlyList<string>? Season,
    int StockQuantity,
    bool IsFeatured);

public sealed record ProductUpdateRequest(
    string Name,
    string Brand,
    decimal Price,
    decimal Rating,
    string Gender,
    string Image,
    string Description,
    string Category,
    IReadOnlyList<string>? Notes,
    string Concentration,
    IReadOnlyList<string>? Season,
    int StockQuantity,
    bool IsFeatured);
