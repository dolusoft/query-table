using System.Text.Json;
using System.Text.Json.Serialization;
using Json.Schema;

namespace QueryTable.Docs;

// #region validator
public sealed class QueryValidator
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        // "asc"/"desc", "next"/"prev"; FilterCondition keeps its own converter.
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private readonly JsonSchema _schema;
    private readonly HashSet<string> _fields;
    private readonly int _maxPageSize;

    /// <param name="schemaPath">query.schema.json from @dolusoft/query-protocol</param>
    /// <param name="fields">the fields your endpoint can filter and sort by</param>
    public QueryValidator(string schemaPath, IEnumerable<string> fields, int maxPageSize = 100)
    {
        _schema = JsonSchema.FromFile(schemaPath);
        _fields = new HashSet<string>(fields);
        _maxPageSize = maxPageSize;
    }

    public bool TryParse(string json, out Query? query, out string error)
    {
        query = null;
        using var document = JsonDocument.Parse(json);
        var body = document.RootElement;

        // 1. The shape: the schema.
        var result = _schema.Evaluate(body, new EvaluationOptions { OutputFormat = OutputFormat.List });
        if (!result.IsValid)
        {
            error = "the body does not match query.schema.json";
            return false;
        }

        // 2. The mode: a `cursor` key means cursor mode, even when it is null.
        Query? parsed = body.TryGetProperty("cursor", out _)
            ? body.Deserialize<CursorQuery>(Json)
            : body.Deserialize<PageQuery>(Json);

        // 3. What the schema cannot know: yours.
        if (parsed is null)
        {
            error = "empty body";
            return false;
        }
        if (parsed.PageSize > _maxPageSize)
        {
            error = $"pageSize is at most {_maxPageSize}";
            return false;
        }
        var names = parsed.Filters.Select(rule => rule.Field)
            .Concat(parsed.Sort is null ? [] : [parsed.Sort.Field]);
        var unknown = names.FirstOrDefault(name => !_fields.Contains(name));
        if (unknown is not null)
        {
            error = $"unknown field: {unknown}";
            return false;
        }

        query = parsed;
        error = "";
        return true;
    }
}
// #endregion validator
