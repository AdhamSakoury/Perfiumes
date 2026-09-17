using Microsoft.AspNetCore.Mvc;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        app = "Perfiumes API",
        status = "running"
    });
}
