using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api")]
public sealed class DeliveryZonesController(DeliveryZoneService zones, AdminAuthService auth) : ControllerBase
{
    [HttpGet("delivery-zones")]
    public async Task<IResult> GetActive() =>
        Results.Ok(await zones.GetAllAsync(activeOnly: true));

    [HttpPost("delivery-zones/detect-location")]
    public async Task<IResult> DetectLocation(DetectLocationRequest request, CancellationToken cancellationToken) =>
        Results.Ok(await zones.DetectLocationAsync(request, cancellationToken));

    [HttpGet("admin/delivery-zones")]
    public async Task<IResult> GetAll()
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();

        return Results.Ok(await zones.GetAllAsync(activeOnly: false));
    }

    [HttpPost("admin/delivery-zones")]
    public async Task<IResult> Create(UpsertDeliveryZoneRequest request)
    {
        if (auth.ValidateRequest(HttpContext)?.Role != "admin")
            return Results.Unauthorized();

        try
        {
            var zone = await zones.CreateAsync(request);
            return Results.Created($"/api/admin/delivery-zones/{zone.Id}", zone);
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpPut("admin/delivery-zones/{id}")]
    public async Task<IResult> Update(string id, UpsertDeliveryZoneRequest request)
    {
        if (auth.ValidateRequest(HttpContext)?.Role != "admin")
            return Results.Unauthorized();

        try
        {
            var zone = await zones.UpdateAsync(id, request);
            return zone is null ? Results.NotFound() : Results.Ok(zone);
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpDelete("admin/delivery-zones/{id}")]
    public async Task<IResult> Delete(string id)
    {
        if (auth.ValidateRequest(HttpContext)?.Role != "admin")
            return Results.Unauthorized();

        return await zones.DeleteAsync(id) ? Results.NoContent() : Results.NotFound();
    }
}
