using System.Text.RegularExpressions;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class ChatbotService(IConfiguration configuration)
{
    private readonly string _storeName = configuration["Chatbot:StoreName"] ?? "Gnouby";

    public Task<ChatbotMessageResponse> ReplyAsync(ChatbotMessageRequest request, IReadOnlyList<Product> products)
    {
        var message = request.Message.Trim();
        if (string.IsNullOrWhiteSpace(message))
        {
            return Task.FromResult(new ChatbotMessageResponse(
                "قولّي المواصفات اللي عايزها: رجالي/حريمي، السعر أو الرينج، ونوع الرائحة زي فريش أو خشبي أو حلو.",
                []));
        }

        if (IsGreeting(message))
        {
            return Task.FromResult(new ChatbotMessageResponse(
                $"تمام يا باشا، منور {_storeName}. اكتبلي مثلًا: عايز حاجة حريمي في حدود 150 أو عطر رجالي خشبي تحت 100.",
                []));
        }

        var criteria = ExtractCriteria(message);
        var suggestions = QueryProducts(products, criteria);

        if (suggestions.Count == 0)
        {
            return Task.FromResult(new ChatbotMessageResponse(BuildNoResultsReply(criteria), []));
        }

        return Task.FromResult(new ChatbotMessageResponse(BuildReply(criteria, suggestions), suggestions));
    }

    private static IReadOnlyList<Product> QueryProducts(IReadOnlyList<Product> products, ChatCriteria criteria)
    {
        IEnumerable<Product> query = products;

        // Hard filters: explicit user constraints must never be violated.
        if (criteria.Gender is not null)
        {
            query = query.Where(product => string.Equals(product.Gender, criteria.Gender, StringComparison.OrdinalIgnoreCase));
        }

        if (criteria.MinPrice is not null)
        {
            query = query.Where(product => product.Price >= criteria.MinPrice);
        }

        if (criteria.MaxPrice is not null)
        {
            query = query.Where(product => product.Price <= criteria.MaxPrice);
        }

        var filtered = query.ToList();
        if (filtered.Count == 0)
        {
            return [];
        }

        var scored = filtered
            .Select(product => new
            {
                Product = product,
                Score = Score(product, criteria)
            })
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Product.Rating)
            .ThenBy(item => item.Product.Price)
            .Select(item => item.Product)
            .Take(3)
            .ToList();

        return scored;
    }

    private static int Score(Product product, ChatCriteria criteria)
    {
        var score = 0;
        var productText = Normalize(string.Join(' ', new[]
        {
            product.Name,
            product.Brand,
            product.Category,
            product.Gender,
            product.Concentration,
            product.Description,
            string.Join(' ', product.Notes),
            string.Join(' ', product.Season)
        }));

        foreach (var note in criteria.Notes)
        {
            if (productText.Contains(note))
            {
                score += 8;
            }
        }

        foreach (var term in criteria.SearchTerms)
        {
            if (productText.Contains(term))
            {
                score += 2;
            }
        }

        if (product.IsFeatured)
        {
            score += 1;
        }

        score += (int)Math.Round(product.Rating);
        return score;
    }

    private static ChatCriteria ExtractCriteria(string message)
    {
        var normalized = Normalize(message);
        var numbers = ExtractNumbers(normalized);
        var priceIntent = HasAny(normalized, "سعر", "رينج", "range", "budget", "ميزانيه", "ميزانية", "حدود", "تحت", "اقل", "أقل", "under", "below", "less");

        decimal? minPrice = null;
        decimal? maxPrice = null;

        if (numbers.Count >= 2 && HasAny(normalized, "بين", "من", "to", "between", "-"))
        {
            minPrice = numbers.Min();
            maxPrice = numbers.Max();
        }
        else if (numbers.Count >= 1 && priceIntent)
        {
            // In shopping chat, "range 150", "budget 150", "في حدود 150" normally means max price 150.
            maxPrice = numbers.Max();
        }

        return new ChatCriteria(
            ExtractGender(normalized),
            minPrice,
            maxPrice,
            ExtractWantedNotes(normalized),
            ExtractSearchTerms(normalized));
    }

    private static string BuildReply(ChatCriteria criteria, IReadOnlyList<Product> suggestions)
    {
        var filters = new List<string>();
        if (criteria.Gender is not null)
        {
            filters.Add(criteria.Gender == "Women" ? "حريمي" : criteria.Gender == "Men" ? "رجالي" : "يونيسكس");
        }

        if (criteria.MinPrice is not null && criteria.MaxPrice is not null)
        {
            filters.Add($"بين {criteria.MinPrice:0} و {criteria.MaxPrice:0}");
        }
        else if (criteria.MaxPrice is not null)
        {
            filters.Add($"لحد {criteria.MaxPrice:0}");
        }

        if (criteria.Notes.Count > 0)
        {
            filters.Add($"بنوتس {string.Join(", ", criteria.Notes)}");
        }

        var intro = filters.Count > 0
            ? $"فلترت الداتا عندي على: {string.Join(" + ", filters)}."
            : "دورت في الداتا المتاحة عندي.";

        var top = suggestions[0];
        return $"{intro} أفضل ترشيح هو {top.Name} من {top.Brand} بسعر ${top.Price:0.##} وتقييم {top.Rating:0.#}/5. دول أقرب اختيارات مطابقة للشروط.";
    }

    private static string BuildNoResultsReply(ChatCriteria criteria)
    {
        var parts = new List<string>();
        if (criteria.Gender is not null)
        {
            parts.Add(criteria.Gender == "Women" ? "حريمي" : criteria.Gender == "Men" ? "رجالي" : "يونيسكس");
        }

        if (criteria.MaxPrice is not null)
        {
            parts.Add($"سعر لحد ${criteria.MaxPrice:0.##}");
        }

        if (criteria.MinPrice is not null)
        {
            parts.Add($"من ${criteria.MinPrice:0.##}");
        }

        var criteriaText = parts.Count > 0 ? string.Join(" و", parts) : "بالشروط دي";
        return $"مش لاقي منتج مطابق لـ {criteriaText} في الداتا الحالية. جرّب تزود الرينج أو تشيل شرط من الشروط.";
    }

    private static bool IsGreeting(string message)
    {
        var normalized = Normalize(message);
        return HasAny(normalized, "عامل ايه", "ازيك", "اهلا", "هاي", "hello", "hi", "hey");
    }

    private static string? ExtractGender(string normalizedMessage)
    {
        if (HasAny(normalizedMessage, "حريمي", "نسائي", "women", "woman", "female", "ladies"))
        {
            return "Women";
        }

        if (HasAny(normalizedMessage, "رجالي", "men", "man", "male"))
        {
            return "Men";
        }

        if (HasAny(normalizedMessage, "يونيسكس", "unisex"))
        {
            return "Unisex";
        }

        return null;
    }

    private static IReadOnlyList<string> ExtractWantedNotes(string normalizedMessage)
    {
        var map = new Dictionary<string, string[]>
        {
            ["woody"] = ["خشب", "خشبي", "woody", "wood", "cedar", "sandalwood"],
            ["oud"] = ["عود", "oud"],
            ["vanilla"] = ["فانيليا", "vanilla", "حلو", "sweet"],
            ["rose"] = ["روز", "ورد", "rose"],
            ["musk"] = ["مسك", "musk"],
            ["fresh"] = ["فريش", "fresh", "citrus", "lemon", "bergamot"],
            ["amber"] = ["عنبر", "amber"],
            ["tobacco"] = ["توباكو", "تبغ", "tobacco"]
        };

        return map
            .Where(entry => entry.Value.Any(term => normalizedMessage.Contains(Normalize(term))))
            .Select(entry => entry.Key)
            .ToList();
    }

    private static IReadOnlyList<string> ExtractSearchTerms(string normalizedMessage)
    {
        var ignored = new HashSet<string>
        {
            "عايز", "عاوزه", "عاوز", "حاجه", "حاجة", "عطر", "برفان", "perfume", "fragrance",
            "في", "من", "الى", "الي", "لحد", "حدود", "range", "budget", "سعر", "تحت", "اقل"
        };

        return normalizedMessage
            .Split([' ', ',', '.', '،', '-', '_'], StringSplitOptions.RemoveEmptyEntries)
            .Where(term => term.Length > 2 && !ignored.Contains(term) && !decimal.TryParse(term, out _))
            .Distinct()
            .Take(8)
            .ToList();
    }

    private static IReadOnlyList<decimal> ExtractNumbers(string normalizedMessage)
    {
        return Regex.Matches(normalizedMessage, @"\d+(\.\d+)?")
            .Select(match => decimal.TryParse(match.Value, out var value) ? value : (decimal?)null)
            .Where(value => value is not null)
            .Select(value => value!.Value)
            .ToList();
    }

    private static bool HasAny(string value, params string[] terms)
    {
        return terms.Any(term => value.Contains(Normalize(term)));
    }

    private static string Normalize(string value)
    {
        return value
            .Trim()
            .ToLowerInvariant()
            .Replace("أ", "ا")
            .Replace("إ", "ا")
            .Replace("آ", "ا")
            .Replace("ى", "ي")
            .Replace("ة", "ه");
    }

    private sealed record ChatCriteria(
        string? Gender,
        decimal? MinPrice,
        decimal? MaxPrice,
        IReadOnlyList<string> Notes,
        IReadOnlyList<string> SearchTerms);
}
