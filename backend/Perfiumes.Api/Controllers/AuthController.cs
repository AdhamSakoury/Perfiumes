using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    UserService users,
    PasswordService passwords,
    EmailService emails,
    GoogleAuthService googleAuth,
    AdminAuthService auth,
    IOptions<EmailOptions> emailOptions,
    IHostEnvironment environment) : ControllerBase
{
    [HttpPost("register")]
    public async Task<IResult> Register(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FullName)
            || string.IsNullOrWhiteSpace(request.Email)
            || string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest(new { message = "Full name, email and password are required." });
        }

        if (!passwords.MeetsComplexityRequirements(request.Password))
        {
            return Results.BadRequest(new { message = "Password must contain at least 8 characters, uppercase, lowercase, number, and special character." });
        }

        var result = await users.RegisterAsync(request);
        return result is null ? Results.Conflict(new { message = "Email already registered" }) : Results.Ok(result);
    }

    [HttpPost("resend-confirmation")]
    public async Task<IResult> ResendConfirmation(ResendActivationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return Results.BadRequest(new { message = "Email is required." });
        }

        return Results.Ok(await users.ResendActivationEmailAsync(request));
    }

    [HttpPost("login")]
    public async Task<IResult> Login(LoginRequest request)
    {
        try
        {
            var result = await users.LoginAsync(request.Email, request.Password);
            return result is null ? Results.Unauthorized() : Results.Ok(result);
        }
        catch (UnauthorizedAccessException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpGet("activate")]
    public async Task<IResult> Activate(string token)
    {
        var activated = await users.ActivateEmailAsync(token);
        var frontendOrigin = emailOptions.Value.FrontendBaseUrl.TrimEnd('/');
        var status = activated ? "activated" : "activation-failed";
        return Results.Redirect($"{frontendOrigin}/login?status={status}");
    }

    [HttpPost("activate")]
    public async Task<IResult> Activate(ActivateEmailRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return Results.BadRequest(new ActivateEmailResponse(false, "Activation token is required."));
        }

        var activated = await users.ActivateEmailAsync(request.Token);
        return Results.Ok(new ActivateEmailResponse(
            activated,
            activated ? "Your account is activated. You can login now." : "Activation link is invalid or expired."));
    }

    [HttpGet("email-status")]
    public IResult EmailStatus()
    {
        var options = emailOptions.Value;
        var normalizedPassword = options.Password?.Replace(" ", string.Empty).Trim() ?? string.Empty;
        return Results.Ok(new
        {
            configured = emails.IsConfigured,
            passwordConfigured = !string.IsNullOrWhiteSpace(options.Password),
            passwordLength = normalizedPassword.Length,
            environment = environment.EnvironmentName,
            userSecretsExpected = environment.IsDevelopment(),
            smtpHost = string.IsNullOrWhiteSpace(options.SmtpHost) ? null : options.SmtpHost,
            fromAddress = options.FromAddress,
            username = options.Username,
            autoConfirmEmail = options.AutoConfirmEmail,
            devFallbackLinks = options.DevFallbackLinks
        });
    }

    [HttpGet("test-email")]
    public async Task<IResult> TestEmail(string? to)
    {
        if (!environment.IsDevelopment())
        {
            return Results.NotFound();
        }

        var target = string.IsNullOrWhiteSpace(to) ? "test@example.com" : to;
        var sent = await emails.SendActivationEmailAsync(target, "Test User", "http://127.0.0.1:4200/activate?token=test");
        return sent
            ? Results.Ok(new { success = true, message = $"Email sent successfully to {target}" })
            : Results.Problem(
                title: "Failed to send email",
                detail: "SMTP is not configured or authentication failed. Set Email:Username and Email:Password via user secrets.",
                statusCode: 500);
    }

    [HttpPost("forgot-password")]
    public async Task<IResult> ForgotPassword(ForgotPasswordRequest request) =>
        Results.Ok(await users.PreparePasswordResetAsync(request));

    [HttpPost("reset-password")]
    public async Task<IResult> ResetPassword(ResetPasswordRequest request)
    {
        if (!passwords.MeetsComplexityRequirements(request.NewPassword))
        {
            return Results.BadRequest(new { message = "Password must contain at least 8 characters, uppercase, lowercase, number, and special character." });
        }

        var result = await users.ResetPasswordAsync(request);
        return result is null ? Results.BadRequest(new { message = "Password reset link is invalid or expired." }) : Results.Ok(result);
    }

    [HttpPut("profile")]
    public async Task<IResult> UpdateProfile(UpdateProfileRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var result = await users.UpdateProfileAsync(principal.Email, request);
            return result is null ? Results.NotFound() : Results.Ok(result);
        }
        catch (InvalidOperationException exception)
        {
            return Results.Conflict(new { message = exception.Message });
        }
        catch (UnauthorizedAccessException exception)
        {
            return Results.BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("google")]
    public async Task<IResult> Google(GoogleLoginRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await googleAuth.LoginAsync(request.Credential, cancellationToken);
            return result is null ? Results.Unauthorized() : Results.Ok(result);
        }
        catch (InvalidOperationException exception)
        {
            return Results.Problem(exception.Message, statusCode: StatusCodes.Status500InternalServerError);
        }
    }
}
