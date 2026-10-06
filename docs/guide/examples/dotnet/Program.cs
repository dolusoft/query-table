using System.Text.Json;
using QueryTable.Docs;

// Checks the JSON files of the guide against query.schema.json, from the .NET
// side: every file in json/valid must pass and parse, every file in
// json/invalid must be refused. Usage: dotnet run --project <this> -- <repo root>
var root = args.Length > 0 ? args[0] : Directory.GetCurrentDirectory();
var schemaPath = Path.Combine(root, "packages", "query-protocol", "query.schema.json");
var examples = Path.Combine(root, "docs", "guide", "examples", "json");

var validator = new QueryValidator(
    schemaPath, ["id", "name", "age", "joined", "active", "level"]);

var failures = 0;
void Check(bool ok, string what)
{
    Console.WriteLine($"{(ok ? "ok  " : "FAIL")} {what}");
    if (!ok)
    {
        failures++;
    }
}

foreach (var file in Directory.GetFiles(Path.Combine(examples, "valid"), "*.json").Order())
{
    var name = Path.GetFileName(file);
    var parsed = validator.TryParse(File.ReadAllText(file), out var query, out var error);
    Check(parsed, $"valid   {name} {error}");
    if (!parsed)
    {
        continue;
    }
    switch (name)
    {
        case "page-extra-keys.json":
            Check(query is PageQuery { Page: 2 }, "page mode, page 2");
            Check(query!.Extra?["tenant"].GetProperty("id").GetInt32() == 7, "unknown key `tenant` kept");
            Check(query.Filters[0].Extra?["label"].GetString() == "Name", "unknown rule property kept");
            Check(JsonSerializer.Serialize(query, QueryValidator.Json).Contains("\"tenant\""), "unknown key written back");
            break;
        case "cursor-first.json":
            Check(query is CursorQuery { Cursor: null }, "cursor mode, first page");
            break;
        case "cursor-next.json":
            Check(query is CursorQuery { Cursor.Direction: CursorDirection.Next }, "cursor mode, next");
            break;
    }
}

foreach (var file in Directory.GetFiles(Path.Combine(examples, "invalid"), "*.json").Order())
{
    Check(!validator.TryParse(File.ReadAllText(file), out _, out _), $"invalid {Path.GetFileName(file)}");
}

Check(!validator.TryParse("""{"page":1,"pageSize":500,"sort":null,"filters":[]}""", out _, out _), "pageSize over the cap");
Check(!validator.TryParse("""{"page":1,"pageSize":10,"sort":null,"filters":[{"field":"password","condition":"Equal","value":"x"}]}""", out _, out _), "field outside the allow-list");

return failures == 0 ? 0 : 1;
