using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/products")]
public sealed class ProductsController(ProductRepository products, AdminAuthService auth) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> GetAll() => Results.Ok(await products.GetAllAsync());

    [HttpGet("{id:int}")]
    public async Task<IResult> GetById(int id)
    {
        var product = await products.GetByIdAsync(id);
        return product is null ? Results.NotFound() : Results.Ok(product);
    }

    [HttpPost]
    public async Task<IResult> Create(ProductCreateRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
        {
            return Results.Unauthorized();
        }
        if (request.StockQuantity < 0)
        {
            return Results.BadRequest(new { message = "Stock quantity cannot be negative." });
        }

        var product = await products.CreateAsync(request);
        return Results.Created($"/api/products/{product.Id}", product);
    }

    [HttpPut("{id:int}")]
    public async Task<IResult> Update(int id, ProductUpdateRequest request)
    {
        if (!auth.IsAuthorized(HttpContext))
        {
            return Results.Unauthorized();
        }
        if (request.StockQuantity < 0)
        {
            return Results.BadRequest(new { message = "Stock quantity cannot be negative." });
        }

        var product = await products.UpdateAsync(id, request);
        return product is null ? Results.NotFound() : Results.Ok(product);
    }

    [HttpDelete("{id:int}")]
    public async Task<IResult> Delete(int id)
    {
        if (!auth.IsAuthorized(HttpContext))
        {
            return Results.Unauthorized();
        }

        return await products.DeleteAsync(id) ? Results.NoContent() : Results.NotFound();
    }
}
