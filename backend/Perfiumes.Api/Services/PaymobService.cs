using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class PaymobOptions
{
    public string BaseUrl { get; set; } = "https://accept.paymob.com";
    public string SecretKey { get; set; } = string.Empty;
    public string PublicKey { get; set; } = string.Empty;
    public string HmacSecret { get; set; } = string.Empty;
    public int CardIntegrationId { get; set; }
    public string Currency { get; set; } = "EGP";
    public string NotificationUrl { get; set; } = string.Empty;
    public string RedirectionUrl { get; set; } = "http://127.0.0.1:4200/payment-result";
}

public sealed class PaymobService(HttpClient http, IOptions<PaymobOptions> options)
{
    private readonly PaymobOptions _options = options.Value;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        // Paymob rejects an explicit notification_url: null. When a public
        // webhook URL is not configured locally, omit the field altogether.
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.SecretKey)
        && !string.IsNullOrWhiteSpace(_options.PublicKey)
        && _options.CardIntegrationId > 0;

    public string? ConfigurationError => IsConfigured
        ? null
        : "Card payment is not configured yet. Add the Paymob secret key, public key, and card integration ID.";

    public async Task<PaymobGatewayCheck> CheckConnectionAsync(CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            return new PaymobGatewayCheck(false, ConfigurationError!);
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Head, $"{_options.BaseUrl.TrimEnd('/')}/");
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            return new PaymobGatewayCheck(true, $"Paymob is reachable (HTTP {(int)response.StatusCode}).");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new PaymobGatewayCheck(false, "Paymob did not respond within 8 seconds.");
        }
        catch (HttpRequestException)
        {
            return new PaymobGatewayCheck(false, "This computer cannot reach Paymob. Check internet, proxy, firewall, or DNS.");
        }
    }

    public async Task<PaymobCheckoutResponse> CreateCheckoutAsync(OrderDto order, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Paymob is not configured. Add Paymob:SecretKey, Paymob:PublicKey, and Paymob:CardIntegrationId.");
        }

        var onlineAmount = OnlineChargeAmount(order);
        if (onlineAmount <= 0)
        {
            throw new InvalidOperationException("There is no product amount to charge online for this order.");
        }

        var amount = ToSmallestCurrencyUnit(onlineAmount);
        var names = SplitName(order.ShippingAddress.Name);
        var phone = NormalizePhone(order.ShippingAddress.Phone);
        var payload = new
        {
            amount,
            currency = _options.Currency,
            payment_methods = new[] { _options.CardIntegrationId },
            // Paymob validates that the items total matches the requested amount.
            // Charge products only; delivery is collected when the order arrives.
            items = new[]
            {
                new
                {
                    name = $"Order {order.Id}",
                    amount,
                    description = "Gnouby Perfumes products (delivery collected on arrival)",
                    quantity = 1
                }
            },
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

    public async Task<PaymobCheckoutResponse> CreateWalletTopUpCheckoutAsync(
        string topUpId,
        decimal amount,
        string userEmail,
        string fullName,
        string? phone,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Paymob is not configured. Add Paymob:SecretKey, Paymob:PublicKey, and Paymob:CardIntegrationId.");
        }

        var amountCents = ToSmallestCurrencyUnit(amount);
        var names = SplitName(string.IsNullOrWhiteSpace(fullName) ? userEmail : fullName);
        var phoneNumber = NormalizePhone(phone ?? string.Empty);
        var redirectionUrl = $"{_options.RedirectionUrl}?type=wallet&topUpId={Uri.EscapeDataString(topUpId)}";

        var payload = new
        {
            amount = amountCents,
            currency = _options.Currency,
            payment_methods = new[] { _options.CardIntegrationId },
            items = new[]
            {
                new
                {
                    name = $"Wallet Top Up #{topUpId}",
                    amount = amountCents,
                    description = $"Perfiumes Wallet Top Up ({amount:0.##} {_options.Currency})",
                    quantity = 1
                }
            },
            billing_data = new
            {
                first_name = names.FirstName,
                last_name = names.LastName,
                email = userEmail,
                phone_number = phoneNumber,
                apartment = "NA",
                floor = "NA",
                street = "NA",
                building = "NA",
                shipping_method = "NA",
                postal_code = "NA",
                city = "Cairo",
                country = "EG",
                state = "Cairo"
            },
            customer = new
            {
                first_name = names.FirstName,
                last_name = names.LastName,
                email = userEmail
            },
            special_reference = topUpId,
            notification_url = BlankAsNull(_options.NotificationUrl),
            redirection_url = redirectionUrl
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
        return new PaymobCheckoutResponse(topUpId, clientSecret, checkoutUrl);
    }

    public async Task<PaymobTransactionVerificationResult> VerifyTransactionAsync(string transactionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            return new PaymobTransactionVerificationResult(false, null, null, 0, "Paymob secret key is not configured.");
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{_options.BaseUrl.TrimEnd('/')}/api/acceptance/transactions/{Uri.EscapeDataString(transactionId)}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Token", _options.SecretKey);

            using var response = await http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new PaymobTransactionVerificationResult(false, transactionId, null, 0, $"Paymob transaction inquiry failed with status {(int)response.StatusCode}.");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var success = root.TryGetProperty("success", out var s) && s.GetBoolean();
            var isVoided = root.TryGetProperty("is_voided", out var iv) && iv.GetBoolean();
            var isRefunded = root.TryGetProperty("is_refunded", out var ir) && ir.GetBoolean();
            var amountCents = root.TryGetProperty("amount_cents", out var ac) && ac.TryGetInt64(out var cents) ? cents : 0;

            string? specialRef = null;
            if (root.TryGetProperty("special_reference", out var sr) && sr.ValueKind == JsonValueKind.String)
            {
                specialRef = sr.GetString();
            }
            else if (root.TryGetProperty("order", out var ord) && ord.TryGetProperty("merchant_order_id", out var moi) && moi.ValueKind == JsonValueKind.String)
            {
                specialRef = moi.GetString();
            }

            var isPaid = success && !isVoided && !isRefunded;
            return new PaymobTransactionVerificationResult(isPaid, transactionId, specialRef, amountCents / 100m, null);
        }
        catch (Exception ex)
        {
            return new PaymobTransactionVerificationResult(false, transactionId, null, 0, ex.Message);
        }
    }

    private static decimal OnlineChargeAmount(OrderDto order)
    {
        if (order.OnlinePaymentAmount > 0)
        {
            return order.OnlinePaymentAmount;
        }

        // Legacy orders created before delivery split: keep charging the stored total.
        return order.Total;
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
        var digits = new string(value.Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits)) return "+201000000000";
        if (digits.StartsWith("00", StringComparison.Ordinal)) return $"+{digits[2..]}";
        if (digits.StartsWith("0", StringComparison.Ordinal)) return $"+20{digits[1..]}";
        if (digits.StartsWith("20", StringComparison.Ordinal)) return $"+{digits}";
        return $"+{digits}";
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

public sealed record PaymobGatewayCheck(bool Reachable, string Message);
