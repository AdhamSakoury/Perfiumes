using Microsoft.AspNetCore.Mvc;
using Perfiumes.Api.Models;
using Perfiumes.Api.Services;

namespace Perfiumes.Api.Controllers;

[ApiController]
[Route("api/admin")]
public sealed class FinanceController(
    AdminDashboardService dashboard,
    AdminAuthService auth) : ControllerBase
{
    [HttpGet("dashboard/financial-summary")]
    public async Task<IResult> FinancialSummary(string? period, string? startDate, string? endDate)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        return Results.Ok(await dashboard.GetFinancialSummaryAsync(
            period ?? "this-month", ParseDate(startDate), ParseDate(endDate)));
    }

    [HttpGet("dashboard/financial-flow")]
    public async Task<IResult> FinancialFlow(string? period, string? startDate, string? endDate)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        return Results.Ok(await dashboard.GetFinancialFlowAsync(
            period ?? "this-month", ParseDate(startDate), ParseDate(endDate)));
    }

    [HttpGet("dashboard/expense-categories")]
    public async Task<IResult> ExpenseCategories(string? period, string? startDate, string? endDate)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        return Results.Ok(await dashboard.GetExpenseCategoriesAsync(
            period ?? "this-month", ParseDate(startDate), ParseDate(endDate)));
    }

    [HttpGet("expenses")]
    public async Task<IResult> GetExpenses(
        string? search, string? category, string? startDate, string? endDate)
    {
        if (!auth.IsAuthorized(HttpContext))
            return Results.Unauthorized();
        return Results.Ok(await dashboard.GetExpensesAsync(
            search, category, ParseDate(startDate), ParseDate(endDate)));
    }

    [HttpPost("expenses")]
    public async Task<IResult> CreateExpense(CreateExpenseRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Category) || request.Amount <= 0)
            return Results.BadRequest(new { message = "Title, category and a positive amount are required." });
        var expense = await dashboard.CreateExpenseAsync(request, principal.Email);
        return Results.Created($"/api/admin/expenses/{expense.Id}", expense);
    }

    [HttpPut("expenses/{id}")]
    public async Task<IResult> UpdateExpense(string id, UpdateExpenseRequest request)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Category) || request.Amount <= 0)
            return Results.BadRequest(new { message = "Title, category and a positive amount are required." });
        var expense = await dashboard.UpdateExpenseAsync(id, request);
        return expense is null ? Results.NotFound() : Results.Ok(expense);
    }

    [HttpDelete("expenses/{id}")]
    public async Task<IResult> DeleteExpense(string id)
    {
        var principal = auth.ValidateRequest(HttpContext);
        if (principal?.Role != "admin")
            return Results.Unauthorized();
        return await dashboard.DeleteExpenseAsync(id) ? Results.NoContent() : Results.NotFound();
    }

    private static DateTimeOffset? ParseDate(string? value) =>
        DateTimeOffset.TryParse(value, out var result) ? result : null;
}
