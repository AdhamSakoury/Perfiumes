using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/admin/newsletter")]
public sealed class NewsletterController(NewsletterService newsletter, AdminAuthService auth) : ControllerBase
{
    [HttpGet("subscribers")]
    public async Task<IResult> GetSubscribers()
    {
        if (!auth.IsAuthorized(HttpContext))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(await newsletter.GetAllAsync());
    }
}
