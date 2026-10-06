namespace QueryTable.Docs;

/// <summary>Your data layer: the filter rules become a query here, never string concatenation.</summary>
public interface IPersonStore
{
    PageResult Page(PageQuery query);
    CursorResult Cursor(CursorQuery query);
}

// #region endpoint
public static class QueryEndpoint
{
    public static IEndpointRouteBuilder MapPeopleQuery(
        this IEndpointRouteBuilder app, QueryValidator validator, IPersonStore store)
    {
        app.MapPost("/api/people/query", async (HttpRequest request) =>
        {
            using var reader = new StreamReader(request.Body);
            var json = await reader.ReadToEndAsync();

            if (!validator.TryParse(json, out var query, out var error))
            {
                return Results.BadRequest(new { error });
            }

            return query switch
            {
                PageQuery page => Results.Ok(store.Page(page)),         // { rows, total }
                CursorQuery cursor => Results.Ok(store.Cursor(cursor)), // { rows, cursors }
                _ => Results.BadRequest()
            };
        });
        return app;
    }
}
// #endregion endpoint
