using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Perfiumes.Api.Models;

namespace Perfiumes.Api.Services;

public sealed class ChatbotService(
    HttpClient http,
    IConfiguration configuration,
    ILogger<ChatbotService> logger)
{
    private readonly string _storeName = configuration["Chatbot:StoreName"] ?? "Gnouby Perfumes";
    private readonly string _apiKey = configuration["Chatbot:ApiKey"] ?? "AQ.Ab8RN6JJ4yrZkJT3nk-q5j4ah6cnpZ0m7V8p6a2bjMUi9cc_4g";
    private readonly string _primaryModel = configuration["Chatbot:Model"] ?? "gemini-3.6-flash";
    private readonly string _fallbackModel = configuration["Chatbot:FallbackModel"] ?? "gemini-flash-latest";

    private const string StorePoliciesSummary = """
    معلومات وسياسات متجر جنوبي (Gnouby Perfumes):
    - نبذة: متجر عطور فاخرة مستوحاة من الهوية والتراث النوبي الراقي والمصري الأصيل.
    - الشحن والتوصيل في مصر:
      * القاهرة والجيزة: 75 جنيه مصري، يصل خلال يومين عمل.
      * الإسكندرية: 95 جنيه مصري، يصل خلال 3 إلى 4 أيام عمل.
      * باقي المحافظات: 120 جنيه مصري، يصل خلال 4 إلى 5 أيام عمل.
    - طرق الدفع المتاحة:
      * الدفع نقداً عند الاستلام (Cash on Delivery).
      * رصيد محفظة جنوبي (Gnouby Wallet) مع إمكانية شحنها واسترداد الأموال إليها.
      * الدفع الإلكتروني بالبطاقات البنكية فيزا وماستركارد (عبر بوابة Paymob الآمنة).
      * الدفع عبر InstaPay والتحويل البنكي الفوري مع تأكيد الطلب.
    - سياسة الاستبدال والاسترجاع:
      * يمكن استرجاع أو استبدال المنتجات غير المفتوحة بحالتها الأصلية خلال 14 يوماً من تاريخ الاستلام.
    - مميزات التوصيل والتتبع المباشر:
      * تتبع حي لمندوب التوصيل بالخريطة التفاعلية GPS من صفحة طلبات العميل لمتابعة خط سيره.
      * إمكانية التواصل والاتصال الهاتفي المباشر أو عبر واتساب أو شات فوري داخل الموقع بين العميل ومندوب التوصيل.
    - التقييمات:
      * يمكن للعميل تقييم العطور وتقييم مندوب التوصيل بعد استلام الطلب مباشرة.
    """;

    public async Task<ChatbotMessageResponse> ReplyAsync(ChatbotMessageRequest request, IReadOnlyList<Product> products)
    {
        var message = request.Message?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(message))
        {
            return new ChatbotMessageResponse(
                "أهلاً بك في جنوبي للعطور! 🌿 قولي إيه ذوقك في العطور (رجالي، حريمي، خشبي، فانيليا، عود، منعش) أو اسألني عن أي استفسار بخصوص الشحن والطلبات.",
                []);
        }

        // 1. RAG Retrieval Stage
        var criteria = ExtractCriteria(message);
        var retrievedProducts = QueryProductsForRag(products, criteria, request.ProductId);

        // 2. Try Gemini API generation
        if (!string.IsNullOrWhiteSpace(_apiKey))
        {
            try
            {
                var geminiReply = await CallGeminiWithRagAsync(message, retrievedProducts, request.History);
                if (!string.IsNullOrWhiteSpace(geminiReply))
                {
                    // Match recommended products from catalog
                    var matchedProducts = MatchProductsInText(geminiReply, retrievedProducts)
                        .DefaultIfEmpty()
                        .Take(3)
                        .Where(p => p != null)
                        .Cast<Product>()
                        .ToList();

                    if (matchedProducts.Count == 0 && retrievedProducts.Count > 0 && IsPerfumeInquiry(message))
                    {
                        matchedProducts = retrievedProducts.Take(3).ToList();
                    }

                    return new ChatbotMessageResponse(geminiReply, matchedProducts);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Gemini API call failed, using rule-based fallback.");
            }
        }

        // 3. Fallback to rule-based engine if Gemini is unavailable
        return FallbackReply(message, criteria, retrievedProducts);
    }

    private async Task<string?> CallGeminiWithRagAsync(
        string userMessage,
        IReadOnlyList<Product> relevantProducts,
        IReadOnlyList<ChatbotHistoryItem>? history)
    {
        var systemPrompt = BuildSystemPrompt(relevantProducts);
        var contents = new List<object>();

        // Include prior conversation turns if provided
        if (history is { Count: > 0 })
        {
            foreach (var item in history.TakeLast(6))
            {
                var role = item.Role.Equals("user", StringComparison.OrdinalIgnoreCase) ? "user" : "model";
                contents.Add(new
                {
                    role = role,
                    parts = new object[] { new { text = item.Text } }
                });
            }
        }

        // Add current user prompt
        contents.Add(new
        {
            role = "user",
            parts = new object[] { new { text = userMessage } }
        });

        var requestBody = new
        {
            system_instruction = new
            {
                parts = new object[] { new { text = systemPrompt } }
            },
            contents = contents,
            generationConfig = new
            {
                temperature = 0.7,
                maxOutputTokens = 1500
            }
        };

        // Try primary model first, then fallback model
        var modelsToTry = new[] { _primaryModel, _fallbackModel, "gemini-3.5-flash" }
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var model in modelsToTry)
        {
            try
            {
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={_apiKey}";
                using var response = await http.PostAsJsonAsync(url, requestBody);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadFromJsonAsync<GeminiGenerateResponse>();
                    var candidateText = json?.Candidates?.FirstOrDefault()?.Content?.Parts?.FirstOrDefault()?.Text;
                    if (!string.IsNullOrWhiteSpace(candidateText))
                    {
                        return candidateText.Trim();
                    }
                }
                else
                {
                    var err = await response.Content.ReadAsStringAsync();
                    logger.LogWarning("Gemini API error with model {Model}: {Error}", model, err);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Gemini attempt failed for model {Model}", model);
            }
        }

        return null;
    }

    private string BuildSystemPrompt(IReadOnlyList<Product> relevantProducts)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"أنت 'مساعد جنوبي الذكي' (Gnouby AI Assistant) وخبير العطور لمتجر '{_storeName}'.");
        sb.AppendLine("مهمتك:");
        sb.AppendLine("1. مساعدة العملاء في اختيار العطور المناسبة لذوقهم، ميزانيتهم، ومناسباتهم، والإجابة عن استفساراتهم بدقة وأناقة.");
        sb.AppendLine("2. تحدث بلباقة وود بلهجة مصرية مهذبة وعصرية (أو بالإنجليزية إذا سأل العميل بالإنجليزية).");
        sb.AppendLine("3. استخدم البيانات المتاحة في سياق المتجر (RAG Knowledge) بدقة، واذكر دائماً أسعار العطور الحقيقية بالجنيه المصري (جنيه) ومكوناتها الأساسية.");
        sb.AppendLine("4. لا تقم أبداً باختراع أو اقتراح عطور غير موجودة في قائمة المتجر المرفقة.");
        sb.AppendLine("5. إذا سأل العميل عن الشحن، الدفع، الاسترجاع، أو تتبع الطلب، أجب بدقة ووضوح من سياسات المتجر الموضحة.");
        sb.AppendLine("6. التنسيق والشكل الجمالي للرد (Styling Rules):");
        sb.AppendLine("   - نسق الرد بطريقة مريحة للعين ومرتبة باستخدام فقرات قصيرة وأسطر متباعدة.");
        sb.AppendLine("   - عند ترشيح عطور، اذكر كل عطر في فقرة أو نقطة مستقلة مع اسم العطر وماركته وسعره بالخط العريض (Bold)، مثل:");
        sb.AppendLine("     ✨ **اسم العطر** (الماركة) — **السعر جنيه**");
        sb.AppendLine("     • **الطابع:** وصف أنيق وموجز للعطر ومناسباته.");
        sb.AppendLine("     • **المكونات:** أبرز النوتات العطرية.");
        sb.AppendLine("   - لا تكدس النصوص في فقرة واحدة متصلة، بل استخدم فواصل وعلامات نقطية واضحة.");
        sb.AppendLine("   - اختم رسالتك دائماً بسؤال لطيف أو دعوة ودية لمساعدة العميل.");
        sb.AppendLine();
        sb.AppendLine("=== سياسات وخدمات المتجر المعتمدة ===");
        sb.AppendLine(StorePoliciesSummary);
        sb.AppendLine();
        sb.AppendLine("=== قائمة العطور المتاحة الأكثر ملائمة للطلب حالياً ===");

        if (relevantProducts.Count > 0)
        {
            foreach (var p in relevantProducts.Take(6))
            {
                var notes = p.Notes != null && p.Notes.Count > 0 ? string.Join(", ", p.Notes) : "مزيج فاخر";
                var season = p.Season != null && p.Season.Count > 0 ? string.Join(", ", p.Season) : "كل الفصول";
                sb.AppendLine($"- الاسم: {p.Name} | الماركة: {p.Brand} | السعر: {p.Price:0.##} جنيه | التقييم: {p.Rating}/5 | الفئة: {p.Gender} ({p.Category}) | التركيز: {p.Concentration} | النوتات العطرية: {notes} | المواسم: {season} | الوصف: {p.Description}");
            }
        }
        else
        {
            sb.AppendLine("لا توجد منتجات مطابقة تماماً للمواصفات المطلوبة، يمكنك توضيح ذلك واقتراح استكشاف المجموعة كاملة.");
        }

        return sb.ToString();
    }

    private static IReadOnlyList<Product> QueryProductsForRag(
        IReadOnlyList<Product> products,
        ChatCriteria criteria,
        int? focusedProductId)
    {
        if (focusedProductId.HasValue)
        {
            var focused = products.FirstOrDefault(p => p.Id == focusedProductId.Value);
            if (focused != null)
            {
                var others = products.Where(p => p.Id != focusedProductId.Value)
                    .OrderByDescending(p => Score(p, criteria))
                    .Take(4);
                return [focused, .. others];
            }
        }

        IEnumerable<Product> query = products;

        // Filter by gender if specified
        if (criteria.Gender is not null)
        {
            query = query.Where(product => string.Equals(product.Gender, criteria.Gender, StringComparison.OrdinalIgnoreCase) || string.Equals(product.Gender, "Unisex", StringComparison.OrdinalIgnoreCase));
        }

        // Soft filter by price range
        if (criteria.MinPrice.HasValue || criteria.MaxPrice.HasValue)
        {
            var min = criteria.MinPrice ?? 0;
            var max = criteria.MaxPrice ?? decimal.MaxValue;
            var priceMatches = query.Where(p => p.Price >= min && p.Price <= max).ToList();
            if (priceMatches.Count > 0)
            {
                query = priceMatches;
            }
        }

        return query
            .Select(product => new
            {
                Product = product,
                Score = Score(product, criteria)
            })
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Product.Rating)
            .Select(item => item.Product)
            .Take(6)
            .ToList();
    }

    private static int Score(Product product, ChatCriteria criteria)
    {
        var score = 0;
        var productText = Normalize(string.Join(' ',
            product.Name,
            product.Brand,
            product.Category,
            product.Gender,
            product.Concentration,
            product.Description,
            string.Join(' ', product.Notes ?? []),
            string.Join(' ', product.Season ?? [])
        ));

        foreach (var note in criteria.Notes)
        {
            if (productText.Contains(note))
            {
                score += 10;
            }
        }

        foreach (var term in criteria.SearchTerms)
        {
            if (productText.Contains(term))
            {
                score += 3;
            }
        }

        if (product.IsFeatured)
        {
            score += 2;
        }

        score += (int)Math.Round(product.Rating);
        return score;
    }

    private static IReadOnlyList<Product> MatchProductsInText(string text, IReadOnlyList<Product> candidates)
    {
        var textNorm = Normalize(text);
        return candidates
            .Where(p => textNorm.Contains(Normalize(p.Name)) || textNorm.Contains(Normalize(p.Brand)))
            .ToList();
    }

    private static bool IsPerfumeInquiry(string message)
    {
        var norm = Normalize(message);
        return HasAny(norm, "عطر", "برفان", "ريحة", "رائحة", "perfume", "fragrance", "نوتات", "عود", "فانيليا", "مسك", "خشب", "رجالي", "حريمي", "سعر", "رخيص", "غالي", "شيك", "صيف", "شتا", "رشح", "ترشيح");
    }

    private ChatbotMessageResponse FallbackReply(string message, ChatCriteria criteria, IReadOnlyList<Product> suggestions)
    {
        var norm = Normalize(message);

        // Store policy fallbacks
        if (HasAny(norm, "شحن", "توصيل", "shipping", "delivery", "كام الشحن", "بيوصل في اد ايه"))
        {
            return new ChatbotMessageResponse(
                "الشحن عندنا سريع لجميع المحافظات! 🚚\n• القاهرة والجيزة: 75 جنيه (يومان عمل).\n• الإسكندرية: 95 جنيه (3-4 أيام عمل).\n• باقي المحافظات: 120 جنيه (4-5 أيام عمل).\nوكمان تقدر تتبع المندوب بالـ GPS على الخريطة لحظة بلحظة وتتواصل معاه شات ومكالمات.",
                []);
        }

        if (HasAny(norm, "دفع", "كاش", "فيزا", "انستاباي", "instapay", "محفظة", "payment", "فودافون كاش"))
        {
            return new ChatbotMessageResponse(
                "طرق الدفع المتاحة في جنوبي متعددة ومرنة: 💳\n1. الدفع عند الاستلام (كاش).\n2. كروت البنك (فيزا وماستركارد) عبر Paymob.\n3. محفظة جنوبي الإلكترونية.\n4. إنستاباي (InstaPay) وتحويل بنكي فوري.",
                []);
        }

        if (HasAny(norm, "استرجاع", "استبدال", "ترجيع", "return", "refund"))
        {
            return new ChatbotMessageResponse(
                "تقدر تسترجع أو تستبدل أي منتج غير مفتوح وبحالته الأصلية خلال 14 يوماً من استلامه بكل سهولة، وفلوسك بترجعلك فوراً لمحفظتك أو بنفس طريقة الدفع.",
                []);
        }

        if (IsGreeting(message))
        {
            return new ChatbotMessageResponse(
                $"أهلاً بحضرتك في {_storeName}! يسعدني أساعدك تختار العطر المناسب لذوقك أو أجاوبك على أي استفسار. قولي بتفضل العطور الرجالي ولا الحريمي، وبتحب النوتات الخشبية، العود، الفانيليا، ولا المنعشة؟",
                suggestions.Take(3).ToList());
        }

        if (suggestions.Count > 0)
        {
            var top = suggestions[0];
            return new ChatbotMessageResponse(
                $"بناءً على طلبك، أفضل ترشيح ليك هو {top.Name} من {top.Brand} بسعر {top.Price:0.##} جنيه وتقييم {top.Rating}/5. دول أفضل عطور تناسب ذوقك من مجموعتنا:",
                suggestions.Take(3).ToList());
        }

        return new ChatbotMessageResponse(
            "تقدر تحددلي تفاصيل أكتر عن اللي بتدور عليه؟ مثلاً عطر رجالي/حريمي، الميزانية، أو الروائح اللي بتحبها زي العود، المسك، أو الحمضيات، وهساعدك تختار الأنسب فوراً!",
            []);
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
            maxPrice = numbers.Max();
        }

        return new ChatCriteria(
            ExtractGender(normalized),
            minPrice,
            maxPrice,
            ExtractWantedNotes(normalized),
            ExtractSearchTerms(normalized));
    }

    private static bool IsGreeting(string message)
    {
        var normalized = Normalize(message);
        return HasAny(normalized, "عامل ايه", "ازيك", "اهلا", "هاي", "hello", "hi", "hey", "صباح الخير", "مساء الخير", "سلام عليكم", "السلام عليكم");
    }

    private static string? ExtractGender(string normalizedMessage)
    {
        if (HasAny(normalizedMessage, "حريمي", "نسائي", "بناتي", "women", "woman", "female", "ladies"))
        {
            return "Women";
        }

        if (HasAny(normalizedMessage, "رجالي", "شبابي", "men", "man", "male"))
        {
            return "Men";
        }

        if (HasAny(normalizedMessage, "يونيسكس", "للجنسين", "unisex"))
        {
            return "Unisex";
        }

        return null;
    }

    private static IReadOnlyList<string> ExtractWantedNotes(string normalizedMessage)
    {
        var map = new Dictionary<string, string[]>
        {
            ["woody"] = ["خشب", "خشبي", "صندل", "woody", "wood", "cedar", "sandalwood"],
            ["oud"] = ["عود", "oud"],
            ["vanilla"] = ["فانيليا", "فانيلا", "vanilla", "حلو", "sweet"],
            ["rose"] = ["روز", "ورد", "زهور", "rose", "floral"],
            ["musk"] = ["مسك", "musk"],
            ["fresh"] = ["فريش", "منعش", "fresh", "citrus", "lemon", "bergamot", "حمضيات"],
            ["amber"] = ["عنبر", "amber"],
            ["tobacco"] = ["توباكو", "تبغ", "tobacco"],
            ["leather"] = ["جلد", "ليذر", "leather"],
            ["spicy"] = ["توابل", "سبايسي", "spicy", "هيل", "قرفة"]
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
            "في", "من", "الى", "الي", "لحد", "حدود", "range", "budget", "سعر", "تحت", "اقل",
            "لو", "سمحت", "ممكن", "ترشحلي", "ترشيح", "افضل", "أفضل", "شيك", "فخم"
        };

        return normalizedMessage
            .Split([' ', ',', '.', '،', '-', '_', '?', '؟', '!'], StringSplitOptions.RemoveEmptyEntries)
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
        return (value ?? string.Empty)
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

    private sealed class GeminiGenerateResponse
    {
        [JsonPropertyName("candidates")]
        public List<GeminiCandidate>? Candidates { get; set; }
    }

    private sealed class GeminiCandidate
    {
        [JsonPropertyName("content")]
        public GeminiContent? Content { get; set; }
    }

    private sealed class GeminiContent
    {
        [JsonPropertyName("parts")]
        public List<GeminiPart>? Parts { get; set; }
    }

    private sealed class GeminiPart
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
