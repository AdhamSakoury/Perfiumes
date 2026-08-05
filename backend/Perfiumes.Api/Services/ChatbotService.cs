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
                "اكتبلي بتحب العطر عامل إزاي: فريش، خشبي، حلو، شرقي، رجالي، حريمي، أو ميزانيتك كام.",
                []));
        }

        if (IsGreeting(message))
        {
            return Task.FromResult(new ChatbotMessageResponse(
                $"تمام يا باشا، منور {_storeName}! قولّي بس بتحب العطر يبقى فريش ولا خشبي ولا حلو؟ ولو عندك budget معين اكتبهولي.",
                []));
        }

        var suggestions = PickSuggestions(message, products);
        if (suggestions.Count == 0)
        {
            return Task.FromResult(new ChatbotMessageResponse(
                "مش لاقي اختيار واضح من كلامك. جرّب تقول مثلًا: عايز عطر خشبي للرجال تحت 100 دولار، أو عايز حاجة حلوة للشتا.",
                []));
        }

        return Task.FromResult(new ChatbotMessageResponse(BuildReply(message, suggestions), suggestions));
    }

    private static bool IsGreeting(string message)
    {
        var normalized = Normalize(message);
        var greetings = new[] { "عامل ايه", "ازيك", "اهلا", "هاي", "hello", "hi", "hey" };
        return greetings.Any(greeting => normalized.Contains(Normalize(greeting)));
    }

    private static IReadOnlyList<Product> PickSuggestions(string message, IReadOnlyList<Product> products)
    {
        if (products.Count == 0)
        {
            return [];
        }

        var normalized = Normalize(message);
        var maxPrice = ExtractMaxPrice(normalized);
        var wantedGender = ExtractGender(normalized);
        var wantedNotes = ExtractWantedNotes(normalized);

        var scored = products
            .Select(product => new
            {
                Product = product,
                Score = Score(product, normalized, maxPrice, wantedGender, wantedNotes)
            })
            .Where(item => item.Score > 0)
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Product.Rating)
            .ThenBy(item => item.Product.Price)
            .Select(item => item.Product)
            .Take(3)
            .ToList();

        if (scored.Count > 0)
        {
            return scored;
        }

        var hasShoppingIntent = new[] { "عايز", "عاوز", "رشح", "اختار", "perfume", "fragrance", "recommend", "suggest" }
            .Any(term => normalized.Contains(Normalize(term)));

        return hasShoppingIntent
            ? products.Where(product => product.IsFeatured).OrderByDescending(product => product.Rating).Take(3).ToList()
            : [];
    }

    private static int Score(Product product, string normalizedMessage, decimal? maxPrice, string? wantedGender, IReadOnlyList<string> wantedNotes)
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

        if (product.Name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(word => normalizedMessage.Contains(Normalize(word))))
        {
            score += 4;
        }

        if (product.Brand.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(word => normalizedMessage.Contains(Normalize(word))))
        {
            score += 3;
        }

        foreach (var note in wantedNotes)
        {
            if (productText.Contains(note))
            {
                score += 5;
            }
        }

        if (wantedGender is not null && Normalize(product.Gender).Contains(wantedGender))
        {
            score += 3;
        }

        if (maxPrice is not null)
        {
            score += product.Price <= maxPrice ? 3 : -6;
        }

        if (normalizedMessage.Contains("شتا") || normalizedMessage.Contains("winter"))
        {
            score += product.Season.Any(season => Normalize(season).Contains("winter") || Normalize(season).Contains("شتا")) ? 2 : 0;
        }

        if (normalizedMessage.Contains("صيف") || normalizedMessage.Contains("summer") || normalizedMessage.Contains("فريش"))
        {
            score += product.Season.Any(season => Normalize(season).Contains("summer") || Normalize(season).Contains("صيف")) ? 2 : 0;
        }

        return score;
    }

    private static string BuildReply(string message, IReadOnlyList<Product> suggestions)
    {
        var normalized = Normalize(message);
        var top = suggestions[0];
        var reasons = new List<string>();

        if (normalized.Contains("خشب") || normalized.Contains("woody") || normalized.Contains("cedar") || normalized.Contains("oud"))
        {
            reasons.Add("ماشي مع الرائحة الخشبية/العود اللي طلبتها");
        }

        if (normalized.Contains("فريش") || normalized.Contains("fresh") || normalized.Contains("citrus"))
        {
            reasons.Add("اتجاهه فريش ومناسب للاستخدام اليومي");
        }

        if (normalized.Contains("حلو") || normalized.Contains("sweet") || normalized.Contains("vanilla"))
        {
            reasons.Add("فيه لمسة حلوة وواضحة");
        }

        var reasonText = reasons.Count > 0
            ? $"اخترت {top.Name} أول واحد لأنه {string.Join("، و", reasons)}."
            : $"أقوى اختيار عندي ليك هو {top.Name} من {top.Brand} بتقييم {top.Rating}/5.";

        return $"{reasonText} جبتلك كمان بدائل قريبة عشان تقارن السعر والستايل.";
    }

    private static IReadOnlyList<string> ExtractWantedNotes(string normalizedMessage)
    {
        var map = new Dictionary<string, string[]>
        {
            ["خشب"] = ["خشب", "خشبي", "woody", "wood", "cedar", "sandalwood"],
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

    private static string? ExtractGender(string normalizedMessage)
    {
        if (normalizedMessage.Contains("رجالي") || normalizedMessage.Contains("men") || normalizedMessage.Contains("male"))
        {
            return "men";
        }

        if (normalizedMessage.Contains("حريمي") || normalizedMessage.Contains("نسائي") || normalizedMessage.Contains("women") || normalizedMessage.Contains("female"))
        {
            return "women";
        }

        if (normalizedMessage.Contains("يونيسكس") || normalizedMessage.Contains("unisex"))
        {
            return "unisex";
        }

        return null;
    }

    private static decimal? ExtractMaxPrice(string normalizedMessage)
    {
        var numbers = normalizedMessage
            .Split([' ', '$', ',', '.', '،'], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => decimal.TryParse(part, out var value) ? value : (decimal?)null)
            .Where(value => value is not null)
            .ToList();

        return numbers.Count > 0
               && (normalizedMessage.Contains("تحت") || normalizedMessage.Contains("اقل") || normalizedMessage.Contains("under"))
            ? numbers.Max()
            : null;
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
}
