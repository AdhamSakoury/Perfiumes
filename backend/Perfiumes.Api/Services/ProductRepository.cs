using System.Text.Json;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class ProductRepository
{
    private readonly string _filePath;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public ProductRepository(IWebHostEnvironment environment)
    {
        var dataDirectory = Path.Combine(environment.ContentRootPath, "data");
        Directory.CreateDirectory(dataDirectory);
        _filePath = Path.Combine(dataDirectory, "products.json");
    }

    public async Task<IReadOnlyList<Product>> GetAllAsync()
    {
        await _lock.WaitAsync();
        try
        {
            return await ReadProductsAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Product?> GetByIdAsync(int id)
    {
        var products = await GetAllAsync();
        return products.FirstOrDefault(product => product.Id == id);
    }

    public async Task<Product> CreateAsync(ProductCreateRequest request)
    {
        await _lock.WaitAsync();
        try
        {
            var products = (await ReadProductsAsync()).ToList();
            var nextId = products.Count == 0 ? 1 : products.Max(product => product.Id) + 1;
            var now = DateTimeOffset.UtcNow;
            var product = new Product(
                nextId,
                request.Name.Trim(),
                request.Brand.Trim(),
                request.Price,
                request.Rating,
                request.Gender.Trim(),
                request.Image.Trim(),
                request.Description.Trim(),
                request.Category.Trim(),
                request.Notes ?? [],
                request.Concentration.Trim(),
                request.Season ?? [],
                request.StockQuantity,
                request.IsFeatured,
                now,
                now);

            products.Add(product);
            await WriteProductsAsync(products);
            return product;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Product?> UpdateAsync(int id, ProductUpdateRequest request)
    {
        await _lock.WaitAsync();
        try
        {
            var products = (await ReadProductsAsync()).ToList();
            var index = products.FindIndex(product => product.Id == id);
            if (index < 0)
            {
                return null;
            }

            var existing = products[index];
            var updated = existing with
            {
                Name = request.Name.Trim(),
                Brand = request.Brand.Trim(),
                Price = request.Price,
                Rating = request.Rating,
                Gender = request.Gender.Trim(),
                Image = request.Image.Trim(),
                Description = request.Description.Trim(),
                Category = request.Category.Trim(),
                Notes = request.Notes ?? [],
                Concentration = request.Concentration.Trim(),
                Season = request.Season ?? [],
                StockQuantity = request.StockQuantity,
                IsFeatured = request.IsFeatured,
                UpdatedAt = DateTimeOffset.UtcNow
            };

            products[index] = updated;
            await WriteProductsAsync(products);
            return updated;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> DeleteAsync(int id)
    {
        await _lock.WaitAsync();
        try
        {
            var products = (await ReadProductsAsync()).ToList();
            var removed = products.RemoveAll(product => product.Id == id) > 0;
            if (removed)
            {
                await WriteProductsAsync(products);
            }

            return removed;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<IReadOnlyList<Product>> ReadProductsAsync()
    {
        if (!File.Exists(_filePath))
        {
            var seedProducts = await ReadSeedProductsAsync();
            await WriteProductsAsync(seedProducts);
            return seedProducts;
        }

        await using var stream = File.OpenRead(_filePath);
        return await JsonSerializer.DeserializeAsync<IReadOnlyList<Product>>(stream, _jsonOptions) ?? [];
    }

    private async Task WriteProductsAsync(IReadOnlyList<Product> products)
    {
        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, products, _jsonOptions);
    }

    private async Task<IReadOnlyList<Product>> ReadSeedProductsAsync()
    {
        var now = DateTimeOffset.UtcNow;
        var seedPath = Path.Combine(AppContext.BaseDirectory, "data", "products.seed.json");
        if (!File.Exists(seedPath))
        {
            seedPath = Path.Combine(Directory.GetCurrentDirectory(), "data", "products.seed.json");
        }

        if (!File.Exists(seedPath))
        {
            return [];
        }

        await using var stream = File.OpenRead(seedPath);
        var products = await JsonSerializer.DeserializeAsync<IReadOnlyList<Product>>(stream, _jsonOptions) ?? [];
        return products.Select((product, index) => product with
        {
            Id = product.Id == 0 ? index + 1 : product.Id,
            StockQuantity = product.StockQuantity == 0 ? 20 : product.StockQuantity,
            IsFeatured = product.IsFeatured || index < 8,
            CreatedAt = product.CreatedAt == default ? now : product.CreatedAt,
            UpdatedAt = product.UpdatedAt == default ? now : product.UpdatedAt
        }).ToList();
    }
}
