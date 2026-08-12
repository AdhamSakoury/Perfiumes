using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Perfiumes.Api.Data;
using Perfiumes.Api.Data.Entities;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class ProductRepository(PerfiumesDbContext db, IWebHostEnvironment environment)
{
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public async Task EnsureSeedAsync()
    {
        await EnsureSchemaAsync();
        if (await db.Products.AnyAsync())
        {
            return;
        }

        var seedProducts = await ReadSeedProductsAsync();
        if (seedProducts.Count == 0)
        {
            return;
        }

        db.Products.AddRange(seedProducts.Select(ToEntity));
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<Product>> GetAllAsync()
    {
        await EnsureSeedAsync();
        var products = await db.Products
            .AsNoTracking()
            .OrderBy(product => product.Id)
            .ToListAsync();

        return products.Select(ToDto).ToList();
    }

    public async Task<Product?> GetByIdAsync(int id)
    {
        await EnsureSeedAsync();
        var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id);
        return product is null ? null : ToDto(product);
    }

    public async Task<Product> CreateAsync(ProductCreateRequest request)
    {
        await EnsureSeedAsync();
        var now = DateTimeOffset.UtcNow;
        var currentMaxId = await db.Products.MaxAsync(product => (int?)product.Id) ?? 0;
        var nextId = currentMaxId + 1;
        var product = new ProductEntity
        {
            Id = nextId,
            Name = request.Name.Trim(),
            Brand = request.Brand.Trim(),
            Price = request.Price,
            Rating = request.Rating,
            Gender = request.Gender.Trim(),
            Image = request.Image.Trim(),
            Description = request.Description.Trim(),
            Category = request.Category.Trim(),
            NotesJson = SerializeList(request.Notes),
            Concentration = request.Concentration.Trim(),
            SeasonJson = SerializeList(request.Season),
            StockQuantity = request.StockQuantity,
            IsFeatured = request.IsFeatured,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Products.Add(product);
        await db.SaveChangesAsync();
        return ToDto(product);
    }

    public async Task<Product?> UpdateAsync(int id, ProductUpdateRequest request)
    {
        await EnsureSeedAsync();
        var product = await db.Products.FirstOrDefaultAsync(item => item.Id == id);
        if (product is null)
        {
            return null;
        }

        product.Name = request.Name.Trim();
        product.Brand = request.Brand.Trim();
        product.Price = request.Price;
        product.Rating = request.Rating;
        product.Gender = request.Gender.Trim();
        product.Image = request.Image.Trim();
        product.Description = request.Description.Trim();
        product.Category = request.Category.Trim();
        product.NotesJson = SerializeList(request.Notes);
        product.Concentration = request.Concentration.Trim();
        product.SeasonJson = SerializeList(request.Season);
        product.StockQuantity = request.StockQuantity;
        product.IsFeatured = request.IsFeatured;
        product.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync();
        return ToDto(product);
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await EnsureSeedAsync();
        var product = await db.Products.FirstOrDefaultAsync(item => item.Id == id);
        if (product is null)
        {
            return false;
        }

        db.Products.Remove(product);
        await db.SaveChangesAsync();
        return true;
    }

    private async Task EnsureSchemaAsync()
    {
        await db.Database.ExecuteSqlRawAsync("""
IF OBJECT_ID(N'[Products]', N'U') IS NULL
BEGIN
    CREATE TABLE [Products] (
        [Id] int NOT NULL CONSTRAINT [PK_Products] PRIMARY KEY,
        [Name] nvarchar(220) NOT NULL,
        [Brand] nvarchar(120) NOT NULL,
        [Price] decimal(18,2) NOT NULL,
        [Rating] decimal(3,1) NOT NULL,
        [Gender] nvarchar(32) NOT NULL,
        [Image] nvarchar(1000) NOT NULL,
        [Description] nvarchar(2000) NOT NULL,
        [Category] nvarchar(120) NOT NULL,
        [NotesJson] nvarchar(max) NOT NULL,
        [Concentration] nvarchar(120) NOT NULL,
        [SeasonJson] nvarchar(max) NOT NULL,
        [StockQuantity] int NOT NULL,
        [IsFeatured] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL
    );
END
""");
    }

    private async Task<IReadOnlyList<Product>> ReadSeedProductsAsync()
    {
        var seedPath = Path.Combine(environment.ContentRootPath, "data", "products.seed.json");
        if (!File.Exists(seedPath))
        {
            seedPath = Path.Combine(AppContext.BaseDirectory, "data", "products.seed.json");
        }

        if (!File.Exists(seedPath))
        {
            return [];
        }

        await using var stream = File.OpenRead(seedPath);
        return await JsonSerializer.DeserializeAsync<IReadOnlyList<Product>>(stream, _jsonOptions) ?? [];
    }

    private ProductEntity ToEntity(Product product)
    {
        var now = DateTimeOffset.UtcNow;
        return new ProductEntity
        {
            Id = product.Id,
            Name = product.Name,
            Brand = product.Brand,
            Price = product.Price,
            Rating = product.Rating,
            Gender = product.Gender,
            Image = product.Image,
            Description = product.Description,
            Category = product.Category,
            NotesJson = SerializeList(product.Notes),
            Concentration = product.Concentration,
            SeasonJson = SerializeList(product.Season),
            StockQuantity = product.StockQuantity,
            IsFeatured = product.IsFeatured,
            CreatedAt = product.CreatedAt == default ? now : product.CreatedAt,
            UpdatedAt = product.UpdatedAt == default ? now : product.UpdatedAt
        };
    }

    private Product ToDto(ProductEntity product)
    {
        return new Product(
            product.Id,
            product.Name,
            product.Brand,
            product.Price,
            product.Rating,
            product.Gender,
            product.Image,
            product.Description,
            product.Category,
            DeserializeList(product.NotesJson),
            product.Concentration,
            DeserializeList(product.SeasonJson),
            product.StockQuantity,
            product.IsFeatured,
            product.CreatedAt,
            product.UpdatedAt);
    }

    private string SerializeList(IReadOnlyList<string>? value)
    {
        return JsonSerializer.Serialize(value ?? [], _jsonOptions);
    }

    private IReadOnlyList<string> DeserializeList(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<IReadOnlyList<string>>(value, _jsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
