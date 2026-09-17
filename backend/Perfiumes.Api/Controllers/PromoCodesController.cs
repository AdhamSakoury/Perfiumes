using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/admin/promos")]
public sealed class PromoCodesController(PromoCodeService promos, AdminAuthService auth) : ControllerBase
{
    [HttpGet]
    public async Task<IResult> GetAll()
    {
        if (!auth.IsAuthorized(HttpContext))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(await promos.GetAllAsync());
    }

    [HttpPost]
    public async Task<IResult> Create(CreatePromoCodeRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
        {
            return Results.Unauthorized();
        }

        try
        {
            var promo = await promos.CreateAsync(request, principal.Email);
            return Results.Created($"/api/admin/promos/{promo.Id}", promo);
        }
        catch (InvalidOperationException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }
}
