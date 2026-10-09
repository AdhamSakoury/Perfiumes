using Microsoft.AspNetCore.Http;

namespace Perfiumes.Api.Models;

public sealed class SendAttachmentRequest
{
    public IFormFile? File { get; set; }
    public string MessageType { get; set; } = string.Empty;
    public string? SenderEmail { get; set; }
    public string? SenderRole { get; set; }
    public string? SenderName { get; set; }
}
