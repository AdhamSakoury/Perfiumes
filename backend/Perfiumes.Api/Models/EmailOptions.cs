namespace Perfiumes.Api.Models;

public sealed class EmailOptions
{
    public const string SectionName = "Email";

    public string FrontendBaseUrl { get; set; } = "http://127.0.0.1:4200";

    public string FromAddress { get; set; } = "no-reply@gnouby.local";

    public string FromName { get; set; } = "Gnouby Perfumes";

    public string SmtpHost { get; set; } = string.Empty;

    public int SmtpPort { get; set; } = 587;

    public bool EnableSsl { get; set; } = true;

    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public int PasswordResetTokenLifetimeMinutes { get; set; } = 30;

    /// <summary>
    /// When true, new accounts are activated immediately without email verification.
    /// </summary>
    public bool AutoConfirmEmail { get; set; }

    /// <summary>
    /// In Development, return activation links in API responses when SMTP is unavailable.
    /// </summary>
    public bool DevFallbackLinks { get; set; } = true;
}
