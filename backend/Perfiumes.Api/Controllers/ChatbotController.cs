using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/chatbot")]
public sealed class ChatbotController(ProductRepository products, ChatbotService chatbot) : ControllerBase
{
    [HttpPost("message")]
    public async Task<IResult> Message(ChatbotMessageRequest request) =>
        Results.Ok(await chatbot.ReplyAsync(request, await products.GetAllAsync()));
}
