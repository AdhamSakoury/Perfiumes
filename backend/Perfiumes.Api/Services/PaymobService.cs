using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class PaymobOptions
{
    public string BaseUrl { get; set; } = "https://accept.paymob.com";
    public string SecretKey { get; set; } = string.Empty;
    public string PublicKey { get; set; } = string.Empty;
    public int CardIntegrationId { get; set; }
    public string Currency { get; set; } = "EGP";
    public string NotificationUrl { get; set; } = string.Empty;
    public string RedirectionUrl { get; set; } = "http://127.0.0.1:4200/payment-result";
}

public sealed class PaymobService(HttpClient http, IOptions<PaymobOptions> options)
{
    private readonly PaymobOptions _options = options.Value;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.SecretKey)
        && !string.IsNullOrWhiteSpace(_options.PublicKey)
        && _options.CardIntegrationId > 0;

    public async Task<PaymobCheckoutResponse> CreateCheckoutAsync(OrderDto order, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Paymob is not configured. Add Paymob:SecretKey, Paymob:PublicKey, and Paymob:CardIntegrationId.");
        }

        var amount = ToSmallestCurrencyUnit(order.Total);
        var names = SplitName(order.ShippingAddress.Name);
        var phone = NormalizePhone(order.ShippingAddress.Phone);
        var payload = new
        {
            amount,
            currency = _options.Currency,
            payment_methods = new[] { _options.CardIntegrationId },
            items = order.Items.Select(item => new
            {
                name = item.Name,
                amount = ToSmallestCurrencyUnit(item.Price * item.Quantity),
                description = item.Name,
                quantity = item.Quantity
            }),
            billing_data = new
            {
                first_name = names.FirstName,
                last_name = names.LastName,
                email = order.UserEmail,
                phone_number = phone,
                apartment = "NA",
                floor = "NA",
                street = BlankAsNa(order.ShippingAddress.Street),
                building = "NA",
                shipping_method = "NA",
                postal_code = BlankAsNa(order.ShippingAddress.Zip),
                city = BlankAsNa(order.ShippingAddress.City),
                country = "EG",
                state = BlankAsNa(order.ShippingAddress.State)
            },
            customer = new
            {
                first_name = names.FirstName,
                last_name = names.LastName,
                email = order.UserEmail
            },
            special_reference = order.Id,
            notification_url = BlankAsNull(_options.NotificationUrl),
            redirection_url = $"{_options.RedirectionUrl}?orderId={Uri.EscapeDataString(order.Id)}"
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/v1/intention/");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _options.SecretKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload, _jsonOptions), Encoding.UTF8, "application/json");

        using var response = await http.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Paymob intention failed: {(int)response.StatusCode} {responseBody}");
        }

        using var document = JsonDocument.Parse(responseBody);
        var root = document.RootElement;
        var clientSecret = root.TryGetProperty("client_secret", out var clientSecretElement)
            ? clientSecretElement.GetString()
            : root.TryGetProperty("cs", out var csElement)
                ? csElement.GetString()
                : null;

        if (string.IsNullOrWhiteSpace(clientSecret))
        {
            throw new InvalidOperationException("Paymob did not return a client_secret.");
        }

        var checkoutUrl = $"{_options.BaseUrl.TrimEnd('/')}/unifiedcheckout/?publicKey={Uri.EscapeDataString(_options.PublicKey)}&clientSecret={Uri.EscapeDataString(clientSecret)}";
        return new PaymobCheckoutResponse(order.Id, clientSecret, checkoutUrl);
    }

    private static int ToSmallestCurrencyUnit(decimal value)
    {
        return (int)Math.Round(value * 100, MidpointRounding.AwayFromZero);
    }

    private static (string FirstName, string LastName) SplitName(string value)
    {
        var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length switch
        {
            0 => ("Gnouby", "Customer"),
            1 => (parts[0], "Customer"),
            _ => (parts[0], string.Join(' ', parts.Skip(1)))
        };
    }

    private static string NormalizePhone(string value)
    {
        var phone = value.Trim();
        return string.IsNullOrWhiteSpace(phone) ? "+201000000000" : phone;
    }

    private static string BlankAsNa(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "NA" : value.Trim();
    }

    private static string? BlankAsNull(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
