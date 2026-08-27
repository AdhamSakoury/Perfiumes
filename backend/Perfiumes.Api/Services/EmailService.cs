using System.Net;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

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
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #333;">Welcome to Gnouby Perfumes!</h2>
                <p>Hi <strong>{WebUtility.HtmlEncode(fullName)}</strong>,</p>
                <p>Thank you for registering with Gnouby Perfumes. Please confirm your email address to activate your account:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{WebUtility.HtmlEncode(activationUrl)}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activate Account</a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="{WebUtility.HtmlEncode(activationUrl)}">{WebUtility.HtmlEncode(activationUrl)}</a></p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #999; font-size: 12px;">This activation link will expire in 24 hours.</p>
            </div>
            """);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string fullName, string resetUrl)
    {
        await SendAsync(
            toEmail,
            "Reset your Gnouby password",
            $"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>Hi <strong>{WebUtility.HtmlEncode(fullName)}</strong>,</p>
                <p>We received a request to reset your password. Use the button below to choose a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{WebUtility.HtmlEncode(resetUrl)}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="{WebUtility.HtmlEncode(resetUrl)}">{WebUtility.HtmlEncode(resetUrl)}</a></p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #999; font-size: 12px;">This link expires in 30 minutes. If you did not request a password reset, you can safely ignore this email.</p>
            </div>
            """);
    }

    private async Task SendAsync(string toEmail, string subject, string htmlBody)
    {
        var host = configuration["Email:SmtpHost"]?.Trim();
        var from = configuration["Email:FromAddress"]?.Trim() ?? "no-reply@gnouby.local";
        var fromName = configuration["Email:FromName"]?.Trim() ?? "Gnouby Perfumes";

        if (!IsConfigured || string.IsNullOrWhiteSpace(host))
        {
            logger.LogInformation(
                "Email SMTP is not configured. Prepared email to {ToEmail}. Subject: {Subject}. Body: {Body}",
                toEmail,
                subject,
                htmlBody);
            return;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, from));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder
        {
            HtmlBody = htmlBody
        };
        message.Body = bodyBuilder.ToMessageBody();

        using var client = new SmtpClient();
        try
        {
            var port = int.TryParse(configuration["Email:SmtpPort"], out var p) ? p : 587;
            var enableSsl = bool.TryParse(configuration["Email:EnableSsl"], out var ssl) ? ssl : true;

            SecureSocketOptions socketOptions = port switch
            {
                465 => SecureSocketOptions.SslOnConnect,
                587 => SecureSocketOptions.StartTls,
                _ => enableSsl ? SecureSocketOptions.Auto : SecureSocketOptions.None
            };

            logger.LogInformation("Connecting to SMTP {Host}:{Port} using {Options}...", host, port, socketOptions);
            await client.ConnectAsync(host, port, socketOptions);

            var username = configuration["Email:Username"]?.Trim();
            var password = configuration["Email:Password"]?.Replace(" ", "").Trim();

            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
            {
                client.AuthenticationMechanisms.Remove("XOAUTH2");
                logger.LogInformation("Authenticating SMTP as {Username}...", username);
                await client.AuthenticateAsync(username, password);
            }

            logger.LogInformation("Sending email to {ToEmail}...", toEmail);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);
            logger.LogInformation("Email sent successfully to {ToEmail}", toEmail);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email to {ToEmail}: {Message}", toEmail, ex.Message);
            throw;
        }
    }
}
