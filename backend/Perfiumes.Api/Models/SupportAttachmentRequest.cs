using Microsoft.AspNetCore.Http;

namespace Perfiumes.Api.Models;

public sealed class SupportAttachmentRequest
{
    public IFormFile? File { get; set; }
    public string MessageType { get; set; } = string.Empty;
    public string? SenderEmail { get; set; }
    public string? SenderName { get; set; }
}
