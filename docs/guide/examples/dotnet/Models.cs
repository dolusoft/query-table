using System.Text.Json;
using System.Text.Json.Serialization;

namespace QueryTable.Docs;

// #region models
[JsonConverter(typeof(JsonStringEnumConverter))] // the names as they are: "Contains"
public enum FilterCondition
{
    Contains, NotContains, Equal, NotEqual, StartsWith, EndsWith,
    GreaterThan, GreaterThanOrEqual, LessThan, LessThanOrEqual
}

public enum SortDirection { Asc, Desc }       // "asc", "desc"
public enum CursorDirection { Next, Prev }    // "next", "prev"

public record FilterRule(string Field, FilterCondition Condition, JsonElement Value)
{
    // Properties the protocol does not know are kept (C-60).
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; init; }
}

public record SortState(string Field, SortDirection Direction);

public record CursorRequest(string Token, CursorDirection Direction);

public abstract record Query(
    int PageSize, SortState? Sort, List<FilterRule> Filters, string? Search)
{
    // Keys the protocol does not know, for example your own `tenant`.
    [JsonExtensionData] public Dictionary<string, JsonElement>? Extra { get; init; }
}

/// <summary>Page mode: the JSON has a <c>page</c> key.</summary>
public record PageQuery(
    int Page, int PageSize, SortState? Sort, List<FilterRule> Filters, string? Search)
    : Query(PageSize, Sort, Filters, Search);

/// <summary>Cursor mode: the JSON has a <c>cursor</c> key (null: the first page).</summary>
public record CursorQuery(
    CursorRequest? Cursor, int PageSize, SortState? Sort, List<FilterRule> Filters, string? Search)
    : Query(PageSize, Sort, Filters, Search);

/// <summary>What the table needs back in page mode.</summary>
public record PageResult(IReadOnlyList<object> Rows, int Total);

/// <summary>What the table needs back in cursor mode; null: no page on that side.</summary>
public record CursorResult(IReadOnlyList<object> Rows, Cursors Cursors);

public record Cursors(string? Next, string? Prev);
// #endregion models
