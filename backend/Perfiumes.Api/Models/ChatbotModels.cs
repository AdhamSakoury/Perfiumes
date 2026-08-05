namespace Perfiumes.Api.Models;

public sealed record ChatbotMessageRequest(string Message, int? ProductId);

public sealed record ChatbotMessageResponse(string Reply, IReadOnlyList<Product> SuggestedProducts);
