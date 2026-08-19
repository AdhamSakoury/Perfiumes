using System.Net;
using System.Net.Mail;

namespace Perfiumes.Api.Services;

public sealed class EmailService(IConfiguration configuration, ILogger<EmailService> logger)
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(configuration["Email:SmtpHost"]);

    public async Task SendActivationEmailAsync(string toEmail, string fullName, string activationUrl)
    {
        await SendAsync(
            toEmail,
            "Activate your Gnouby account",
            $"""
            <p>Hi {WebUtility.HtmlEncode(fullName)},</p>
            <p>Welcome to Gnouby Perfumes. Please activate your account using the link below:</p>
            <p><a href="{WebUtility.HtmlEncode(activationUrl)}">Activate account</a></p>
            <p>This link expires in 24 hours.</p>
            """);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string fullName, string resetUrl)
    {
        await SendAsync(
            toEmail,
            "Reset your Gnouby password",
            $"""
            <p>Hi {WebUtility.HtmlEncode(fullName)},</p>
            <p>Use the link below to choose a new password:</p>
            <p><a href="{WebUtility.HtmlEncode(resetUrl)}">Reset password</a></p>
            <p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>
            """);
    }

    private async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        var host = configuration["Email:SmtpHost"];
        var from = configuration["Email:FromAddress"] ?? "no-reply@gnouby.local";
        var fromName = configuration["Email:FromName"] ?? "Gnouby Perfumes";

        if (!IsConfigured)
        {
            logger.LogInformation(
                "Email SMTP is not configured. Prepared email to {ToEmail}. Subject: {Subject}. Body: {Body}",
                toEmail,
                subject,
                htmlBody);
            return;
        }

        using var message = new MailMessage
        {
            From = new MailAddress(from, fromName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        message.To.Add(toEmail);

        using var client = new SmtpClient(host)
        {
            Port = int.TryParse(configuration["Email:SmtpPort"], out var port) ? port : 587,
            EnableSsl = bool.TryParse(configuration["Email:EnableSsl"], out var enableSsl) ? enableSsl : true
        };

        var username = configuration["Email:Username"];
        var password = configuration["Email:Password"];
        if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
        {
            client.Credentials = new NetworkCredential(username, password);
        }

        await client.SendMailAsync(message);
    }
}
