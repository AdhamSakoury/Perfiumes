using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/admin")]
public sealed class AdminAuthController(UserService users) : ControllerBase
{
    [HttpPost("login")]
    public async Task<IResult> Login(AdminLoginRequest request)
    {
        var result = await users.LoginAsync(request.Email, request.Password);
        return result is null || result.User.Role != "admin"
            ? Results.Unauthorized()
            : Results.Ok(new AdminLoginResponse(result.AccessToken, "Bearer", result.ExpiresAt));
    }
}
