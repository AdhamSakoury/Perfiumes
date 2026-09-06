using System.Net;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class EmailService(IOptions<EmailOptions> options, ILogger<EmailService> logger)
{
    private readonly EmailOptions _options = options.Value;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.SmtpHost)
        && !string.IsNullOrWhiteSpace(_options.Username)
        && !string.IsNullOrWhiteSpace(_options.Password);

    public async Task<bool> SendActivationEmailAsync(string toEmail, string fullName, string activationUrl)
    {
        return await SendAsync(
            toEmail,
            "Activate your Gnouby account",
            BuildActivationHtml(fullName, activationUrl));
    }

    public async Task<bool> SendPasswordResetEmailAsync(string toEmail, string fullName, string resetUrl)
    {
        return await SendAsync(
            toEmail,
            "Reset your Gnouby password",
            BuildPasswordResetHtml(fullName, resetUrl));
    }

    private async Task<bool> SendAsync(string toEmail, string subject, string htmlBody)
    {
        var host = _options.SmtpHost.Trim();
        var from = NormalizeEmail(_options.FromAddress) ?? "no-reply@gnouby.local";
        var fromName = _options.FromName.Trim();
        var normalizedToEmail = NormalizeEmail(toEmail) ?? toEmail;

        if (!IsConfigured)
        {
            logger.LogWarning(
                "Email SMTP is not configured. Set Email:SmtpHost, Email:Username, and Email:Password in user secrets or environment variables.");
            logger.LogInformation(
                "Prepared email to {ToEmail}. Subject: {Subject}",
                normalizedToEmail,
                subject);
            return false;
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, from));
        message.To.Add(MailboxAddress.Parse(normalizedToEmail));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

        var username = NormalizeEmail(_options.Username) ?? _options.Username.Trim();
        var password = _options.Password.Replace(" ", string.Empty).Trim();
        var attempts = BuildSmtpAttempts(host, _options.SmtpPort, _options.EnableSsl);

        foreach (var attempt in attempts)
        {
            if (await TrySendAsync(message, username, password, normalizedToEmail, attempt))
            {
                return true;
            }
        }

        return false;
    }

    private async Task<bool> TrySendAsync(
        MimeMessage message,
        string username,
        string password,
        string normalizedToEmail,
        SmtpAttempt attempt)
    {
        using var client = new SmtpClient();
        try
        {
            client.Timeout = 15000;
            logger.LogInformation(
                "Connecting to SMTP {Host}:{Port} using {Options}...",
                attempt.Host,
                attempt.Port,
                attempt.SocketOptions);
            await client.ConnectAsync(attempt.Host, attempt.Port, attempt.SocketOptions);

            client.AuthenticationMechanisms.Remove("XOAUTH2");
            logger.LogInformation("Authenticating SMTP as {Username}...", username);
            await client.AuthenticateAsync(username, password);

            logger.LogInformation("Sending email to {ToEmail}...", normalizedToEmail);
            await client.SendAsync(message);
            await client.DisconnectAsync(true);
            logger.LogInformation("Email sent successfully to {ToEmail} via {Host}:{Port}", normalizedToEmail, attempt.Host, attempt.Port);
            return true;
        }
        catch (AuthenticationException ex)
        {
            logger.LogError(
                ex,
                "SMTP authentication failed for {Username} on {Host}:{Port}. Verify 2-Step Verification is ON, create a fresh App Password at https://myaccount.google.com/apppasswords, then run: dotnet user-secrets set \"Email:Password\" \"xxxx xxxx xxxx xxxx\"",
                username,
                attempt.Host,
                attempt.Port);
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Failed to send email to {ToEmail} via {Host}:{Port}: {Message}",
                normalizedToEmail,
                attempt.Host,
                attempt.Port,
                ex.Message);
            return false;
        }
        finally
        {
            if (client.IsConnected)
            {
                await client.DisconnectAsync(true);
            }
        }
    }

    private static IReadOnlyList<SmtpAttempt> BuildSmtpAttempts(string host, int configuredPort, bool enableSsl)
    {
        var hosts = new[] { host, "smtp.gmail.com", "smtp.googlemail.com" }
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var attempts = new List<SmtpAttempt>();
        foreach (var smtpHost in hosts)
        {
            attempts.Add(new SmtpAttempt(smtpHost, 587, SecureSocketOptions.StartTls));
            attempts.Add(new SmtpAttempt(smtpHost, 465, SecureSocketOptions.SslOnConnect));
        }

        if (configuredPort is not 587 and not 465 and > 0)
        {
            var socketOptions = enableSsl ? SecureSocketOptions.Auto : SecureSocketOptions.None;
            attempts.Insert(0, new SmtpAttempt(host, configuredPort, socketOptions));
        }

        return attempts
            .DistinctBy(item => $"{item.Host}:{item.Port}:{item.SocketOptions}")
            .ToArray();
    }

    private sealed record SmtpAttempt(string Host, int Port, SecureSocketOptions SocketOptions);

    private static string BuildActivationHtml(string fullName, string activationUrl)
    {
        return $"""
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
            """;
    }

    private static string BuildPasswordResetHtml(string fullName, string resetUrl)
    {
        return $"""
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
            """;
    }

    private static string? NormalizeEmail(string? value)
    {
        return value?.Trim().Replace("\\@", "@");
    }
}
