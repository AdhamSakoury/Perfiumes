namespace Perfiumes.Api.Models;

public sealed record ChatbotHistoryItem(string Role, string Text);

public sealed record ChatbotMessageRequest(
    string Message,
    int? ProductId,
    IReadOnlyList<ChatbotHistoryItem>? History = null);

public sealed record ChatbotMessageResponse(
    string Reply,
    IReadOnlyList<Product> SuggestedProducts);
