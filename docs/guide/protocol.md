# The query protocol

For backend developers. A Query Table tells your server what the user asked for as one small JSON object, the **query**. This page describes that object, what your server has to do with it, what it has to send back, and how to check it against a JSON Schema. You do not need the table, Vue or any JavaScript to implement it.

The table never fetches. The page that uses it takes the query, sends it to your endpoint (a `POST` body is the easiest transport) and gives the answer back to the table. So the JSON below is what your endpoint receives as long as the consumer sends the query as it is.

Types and the filter grammar live in `@dolusoft/query-protocol`, a package with no dependencies. The JSON Schema is `@dolusoft/query-protocol/query.schema.json` ([below](#json-schema)).

## The query

A query has two modes. Everything but the paging is the same in both.

| Key        | Both modes | Meaning                                                                                           |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `pageSize` | yes        | Rows per page, a whole number of at least 1. The protocol sets no upper bound; you should (below). |
| `sort`     | yes        | `null` (unsorted) or one `{ field, direction }`, `direction` being `"asc"` or `"desc"`.            |
| `filters`  | yes        | A list of rules, empty for none ([filters](#filters)).                                            |
| `search`   | optional   | Global search text. Absent means no search; the table never sends `""`.                           |
| `page`     | page mode  | 1-based page number.                                                                              |
| `cursor`   | cursor mode | `null` for the first page, else `{ token, direction }` ([cursor mode](#cursor-mode)).            |

A query is in cursor mode exactly when it has a `cursor` key, and a query never has both `page` and `cursor`.

### Page mode

<!-- snippet: json/valid/page-first.json -->
```json
{
  "page": 1,
  "pageSize": 20,
  "sort": null,
  "filters": []
}
```

A page past the end is not an error for the table: answer it with an empty `rows` and the same `total`.

### Cursor mode

For results that are large, live or hard to count (logs, audit trails), where "page 3 of 4,128" makes no sense. Instead of a number the query names the cursor to follow:

<!-- snippet: json/valid/cursor-first.json -->
```json
{
  "cursor": null,
  "pageSize": 50,
  "sort": null,
  "filters": []
}
```

<!-- snippet: json/valid/cursor-next.json -->
```json
{
  "cursor": { "token": "eyJ0IjoiMjAyNi0xMC0wNiIsImlkIjo0Mn0=", "direction": "next" },
  "pageSize": 50,
  "sort": null,
  "filters": [{ "field": "level", "condition": "Equal", "value": "error" }],
  "search": "timeout"
}
```

- `token` is a cursor your server gave out with the previous answer. It is **opaque**: the table and the consumer never look inside, so it may be base64, a JSON string (a four-field position object, `JSON.stringify`-ed, is fine) or anything else. The schema sets no length limit on purpose.
- `direction` says on which side of the page being shown the wanted page lies: `"next"` or `"prev"`. How that maps to your own terms (`Forward` / `Backward`, `after` / `before`) is the consumer's business; the protocol only says which of your two cursors was used.
- A new sort, a filter change, a new page size, a search and "clear all filters" all send `cursor: null`: a cursor belongs to the order, filters and size it was issued for (C-57). If your cursor also depends on something outside the query (a time range, a data source), the consumer resets it to `null` itself when that changes.
- Servers usually fix the order in cursor mode. Then switch sorting off for those columns in the table (`sortable: false` on the column in the Vue package) so the user is not offered a sort button that does nothing. The query still has a `sort` key; ignore it, or reject a non-null one.

## Filters

`filters` is a flat list. Every rule has the same three keys:

```json
{ "field": "age", "condition": "GreaterThanOrEqual", "value": 18 }
```

**Combining rules.** Rules of one `field` combine with **OR**, unless all of them are negative (`NotEqual`, `NotContains`), then with **AND**. Rules of different fields combine with **AND**. The table only produces the rules; evaluating them is your job (C-17).

<!-- snippet: server.ts#combine -->
```ts
/**
 * Rules of one field combine with OR, or with AND when all of them are
 * negative; rules of different fields combine with AND.
 */
export const matches = (row: Person, filters: readonly FilterRule[]) =>
  [...new Set(filters.map(rule => rule.field))].every(field => {
    const rules = filters.filter(rule => rule.field === field)
    return rules.every(isNegative)
      ? rules.every(rule => holds(row, rule))
      : rules.some(rule => holds(row, rule))
  })
```

**Conditions and values per column type.** The table offers these in its filter menu (the Vue component names them through `labels.filterCondition`), and the type decides the `value` type:

| Column type         | `value` is | Conditions offered                                                                | Default      |
| ------------------- | ---------- | --------------------------------------------------------------------------------- | ------------ |
| `string`            | string     | `Contains`, `NotContains`, `Equal`, `NotEqual`, `StartsWith`, `EndsWith`          | `Contains`   |
| `number`, `integer` | number     | `Equal`, `NotEqual`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual` | `Equal` |
| `date`, `datetime`  | string     | `Equal`, `NotEqual`, `GreaterThan` (after), `LessThan` (before)                   | `Equal`      |
| `bool`              | boolean    | `Equal`, `NotEqual`                                                               | `Equal`      |

An `integer` column never produces a number with a fraction, and text that is not a number produces no rule at all. Date text is **not validated** by the table; it is the string the date input gave, so parse and validate it yourself.

The schema accepts all ten conditions with any value type, because a query can also come from somewhere else (a saved view, a URL). Refuse the combinations your endpoint does not support (`Contains` on a number, `GreaterThan` on a boolean) with a 400.

**Typed shortcuts never arrive.** In a text column the user can type `*foo*`, `foo*`, `*foo`, `!foo`, `!*foo*` or `a,b`. The table turns them into clean rules, so you only ever see the ten conditions. Two details: there is no `NotStartsWith` or `NotEndsWith`, so `!foo*` and `!*foo` arrive as `NotContains` with value `foo`, and `a,b` arrives as two rules for the same field (an OR).

<!-- snippet: queries.ts#grammar -->
```ts
// What a user types into a filter input becomes clean rules. The shortcuts
// (`*`, `!`, `,`) never reach the query.
export const nameRules = parseFilterInput('ali*,!veli', { field: 'name' })
// [
//   { field: 'name', condition: 'StartsWith', value: 'ali' },
//   { field: 'name', condition: 'NotEqual', value: 'veli' }
// ]

export const ageRules = parseFilterInput('18', { field: 'age', type: 'number' })
// [{ field: 'age', condition: 'Equal', value: 18 }]

export const noRules = parseFilterInput('2.5', {
  field: 'count',
  type: 'integer'
})
// [] (an integer column takes whole numbers only)
```

A full page-mode query with sort, rules and search:

<!-- snippet: json/valid/page-filtered.json -->
```json
{
  "page": 1,
  "pageSize": 20,
  "sort": { "field": "joined", "direction": "desc" },
  "filters": [
    { "field": "name", "condition": "StartsWith", "value": "Ali" },
    { "field": "name", "condition": "Contains", "value": "veli" },
    { "field": "age", "condition": "GreaterThanOrEqual", "value": 18 },
    { "field": "active", "condition": "Equal", "value": true }
  ],
  "search": "ankara"
}
```

**`field` is not trusted input.** It is the column `field` the page chose, and it can name a column that does not exist (a saved view from an older version, a hand-made request). Check every `field` of `filters` and `sort` against your own allow-list and map it to a column yourself; never put it into SQL.

## Search

`search` is free text. What it matches is decided by your endpoint, not by the protocol: one endpoint may look in a name column, another in five. The query carries no list of columns to search.

The text arrives as typed, spaces included, and an empty search is left out of the query. Deciding a minimum length is yours. Debouncing is the page's: the core plugin emits on every change, and the Vue package waits a configurable delay (`0` turns that off, for a consumer that debounces itself). Do not debounce twice.

## Reasons

An update the table makes carries a **reason**, the kind of user action behind it. The reason is **not part of the query JSON**. The table hands it to the consumer next to the query, and your server sees it only if the consumer sends it (a header, a `reason` key of its own).

| Reason     | The user                       |
| ---------- | ------------------------------ |
| `page`     | stepped to another page        |
| `pageSize` | picked another page size       |
| `sort`     | sorted a column                |
| `filter`   | changed a column's filter      |
| `reset`    | cleared all filters            |
| `search`   | changed the search text        |

<!-- snippet: queries.ts#reasons -->
```ts
export const reasons: readonly QueryChangeReason[] = queryChangeReasons
// ['page', 'pageSize', 'sort', 'filter', 'reset', 'search']
```

A consumer can use it for things like keeping the old total on `page` or `sort` (those cannot change it) and recounting on the rest.

## What your server returns

The protocol describes the request only. The answer is whatever the consumer needs to hand the table, and for each mode that is:

| Mode | Rows | And |
| ---- | ---- | --- |
| Page | the rows of the page | the total number of rows of the whole result, if you know it |
| Cursor | the rows of the page | `cursors`: `{ next, prev }`, each a token or `null` when there is no page on that side |

<!-- snippet: server.ts#rows -->
```ts
export interface Person {
  id: number
  name: string
  age: number
  joined: string
  active: boolean
}

export const people: Person[] = [
  { id: 1, name: 'Ali', age: 31, joined: '2021-03-01', active: true },
  { id: 2, name: 'Ayşe', age: 27, joined: '2022-07-15', active: true },
  { id: 3, name: 'Veli', age: 45, joined: '2019-11-30', active: false },
  { id: 4, name: 'Zeynep', age: 36, joined: '2023-01-09', active: true },
  { id: 5, name: 'Can', age: 22, joined: '2024-05-20', active: true },
  { id: 6, name: 'Elif', age: 29, joined: '2020-09-02', active: false }
]

/** Page mode: the rows of the page and the total of the whole result. */
export interface PageAnswer {
  rows: Person[]
  total: number
}

/** Cursor mode: the rows and the cursors of the page, no total needed. */
export interface CursorAnswer {
  rows: Person[]
  cursors: PageCursors
}
```

A few details that save surprises:

- **An unknown total is fine.** In page mode, leave the total out and the table treats a full page as "there may be a next page" and a short one as the last. In cursor mode there is no total unless you add one: it can arrive later from a separate count request (`null` first, then the number), and the table needs nothing else.
- **The consumer owns the cursors.** `cursors.prev` does not have to come from your server. A backend that only answers forward gives no `prev`; the consumer can keep a stack of the tokens of the pages already visited and offer the top of it as `prev`. The table cannot tell the difference.

<!-- snippet: cursor-stack.ts#stack -->
```ts
const first = '' // the token that stands for "the first page"

/**
 * Gives a forward-only backend the `prev` cursor the table asks for: the
 * consumer remembers the tokens of the pages already visited.
 */
export function createCursorPager<Row>(backend: ForwardBackend<Row>) {
  const visited: Array<string | null> = [] // tokens of the pages before this
  let current: string | null = null

  return (query: CursorQuery): { rows: Row[]; cursors: PageCursors } => {
    const { cursor } = query
    if (cursor === null) {
      visited.length = 0
      current = null
    } else if (cursor.direction === 'next') {
      visited.push(current)
      current = cursor.token
    } else {
      // The table asked for `prev`: go back to the page we came from.
      visited.pop()
      current = cursor.token === first ? null : cursor.token
    }
    const { rows, next } = backend.fetch(current, query.pageSize)
    const before = visited[visited.length - 1]
    return {
      rows,
      cursors: {
        next,
        // `prev` is whatever token leads back; the table does not care who
        // made it.
        prev: visited.length === 0 ? null : (before ?? first)
      }
    }
  }
}
```

- **Row selection keys are strings.** If the table is used with row selection, the selection is a map from row key to `true`, and a key is always a string. A numeric `id` comes back as `"42"`; convert it on the consumer's side before it reaches your API (a bulk delete, say). Selection never changes the query.

## Keys you add yourself

The table keeps what it does not know. Any extra key of the query, and any extra property of a filter rule, is copied into every query the table emits and counts when two queries are compared (C-60). A consumer can therefore put its own context into the query (a tenant, a time range) and read it back on the server.

<!-- snippet: json/valid/page-extra-keys.json -->
```json
{
  "page": 2,
  "pageSize": 20,
  "sort": null,
  "filters": [
    { "field": "name", "condition": "Contains", "value": "a", "label": "Name" }
  ],
  "tenant": { "id": 7 }
}
```

The schema allows these at the top level and on rules. It does **not** allow extra keys inside `sort` or `cursor`. Unknown keys are the consumer's: the table never invents one, so ignore the ones you do not understand. (Version 2.2 dropped them; 3.0 keeps them, see [the migration notes](migration-v3.md).)

### Reserved names

Some names are kept for future forms of the query. Do not use these names for your own extensions:

- the top-level keys `sorts`, `any`, `group`, `aggregates`, `columns` and `range`;
- the conditions `IsNull` and `IsNotNull`.

The table carries them like any other unknown key, but the local evaluator refuses `sorts`, `any`, `group`, `aggregates`, `IsNull` and `IsNotNull`, and a server that follows the same semantics profile does too. Future forms go into a versioned envelope, not into the query; see [Versioning](semantics.md#versioning) in the semantics profile.

## JSON Schema

`@dolusoft/query-protocol` ships the schema as `query.schema.json` (JSON Schema draft 2020-12, in the repository at `packages/query-protocol/query.schema.json`). It is generated from the same lists the TypeScript types are made of (`pnpm schema:gen`), and CI fails when the committed file is out of date, so it cannot drift from the types.

It checks the **shape**:

- exactly one of `page` and `cursor`;
- `page` and `pageSize` are whole numbers of at least 1;
- `sort` is `null` or `{ field, direction }` with a known direction;
- every rule has a non-empty `field`, one of the ten conditions and a string, number or boolean `value`;
- `search`, when present, is not empty;
- unknown keys at the top level and on rules are allowed.

It cannot check what depends on your data: whether a `field` exists, whether a condition makes sense for that field, whether a date parses, whether a cursor is still valid, and how large a page may be. Check those yourself and answer 400.

Valid and invalid examples (the ones in this guide are run against the schema in CI):

<!-- snippet: json/invalid/page-and-cursor.json -->
```json
{
  "page": 1,
  "cursor": null,
  "pageSize": 20,
  "sort": null,
  "filters": []
}
```

## Example: .NET

Records for the query, `System.Text.Json` to read it and [JsonSchema.Net](https://www.nuget.org/packages/JsonSchema.Net) to validate it against `query.schema.json`. The whole project is in [`examples/dotnet`](examples/dotnet); CI builds it and runs the guide's JSON files through it.

Copy `query.schema.json` into your project (from the npm package, or from the repository) and keep it up to date with the protocol version you target.

<!-- snippet: dotnet/Models.cs#models -->
```csharp
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
```

`cursor: null` and a missing `cursor` read the same into a C# property, so the mode is decided from the JSON itself (`TryGetProperty("cursor", ...)`), after the schema has already guaranteed that `page` and `cursor` do not appear together.

<!-- snippet: dotnet/QueryValidator.cs#validator -->
```csharp
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
```

An ASP.NET Core minimal API endpoint on top of it. The `IPersonStore` is your data layer: it turns the rules into a database query with parameters.

<!-- snippet: dotnet/QueryEndpoint.cs#endpoint -->
```csharp
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
```

The `JsonSerializerDefaults.Web` options give the camel-case names of the JSON (`pageSize`, `rows`, `cursors`), so the answer needs no extra setup. To run the project's checks yourself: `dotnet run --project docs/guide/examples/dotnet -- <repository root>`.

## Example: TypeScript

The same job on a Node server, with [Ajv](https://ajv.js.org) for the schema. This is framework-free: `handle` takes the parsed JSON body and returns a status and a JSON value.

<!-- snippet: server.ts#validate -->
```ts
// The schema checks the shape. What it cannot know is yours to check: which
// fields exist, which condition a field takes, how large a page may be.
// `strict: false`: the schema uses union types and untyped `required`, which
// Ajv's strict mode only warns about.
const ajv = new Ajv2020({ strict: false })
const validateShape = ajv.compile(schema)

const fields = ['id', 'name', 'age', 'joined', 'active'] as const
type Field = (typeof fields)[number]
const isField = (name: string): name is Field =>
  (fields as readonly string[]).includes(name)
const maxPageSize = 100

export function parseQuery(body: unknown): Query {
  if (!validateShape(body)) {
    throw new BadQuery(ajv.errorsText(validateShape.errors))
  }
  const query = body as Query
  if (query.pageSize > maxPageSize) {
    throw new BadQuery(`pageSize is at most ${maxPageSize}`)
  }
  for (const name of [
    ...query.filters.map(rule => rule.field),
    ...(query.sort ? [query.sort.field] : [])
  ]) {
    if (!isField(name)) {
      throw new BadQuery(`unknown field: ${name}`)
    }
  }
  return query
}
```

Answering both modes. The cursor here names a row, and `direction` tells which side of the current page to read:

<!-- snippet: server.ts#answer -->
```ts
export function answer(query: PageQuery): PageAnswer
export function answer(query: CursorQuery): CursorAnswer
export function answer(query: Query): PageAnswer | CursorAnswer
export function answer(query: Query): PageAnswer | CursorAnswer {
  const all = select(query)
  const size = query.pageSize

  if (!isCursorQuery(query)) {
    const start = (query.page - 1) * size
    return { rows: all.slice(start, start + size), total: all.length }
  }

  // Cursor mode: the token names a row; the direction says on which side of
  // the current page the wanted page lies.
  const { cursor } = query
  let start = 0
  if (cursor) {
    const at = all.findIndex(row => row.id === decode(cursor.token))
    if (at < 0) {
      throw new BadQuery('the cursor does not belong to this result')
    }
    start = cursor.direction === 'next' ? at + 1 : Math.max(0, at - size)
  }
  const rows = all.slice(start, start + size)
  return {
    rows,
    cursors: {
      prev: start > 0 ? encode(rows[0].id) : null,
      next: start + size < all.length ? encode(rows[rows.length - 1].id) : null
    }
  }
}
```

<!-- snippet: server.ts#handler -->
```ts
/** A POST endpoint, framework aside: the JSON body in, status and JSON out. */
export function handle(body: unknown): { status: number; json: unknown } {
  try {
    const query = parseQuery(body)
    // Keys the protocol does not know are yours (C-60): here a tenant.
    const { tenant } = query as Query & { tenant?: { id: number } }
    return { status: 200, json: { tenant: tenant?.id, ...answer(query) } }
  } catch (error) {
    if (error instanceof BadQuery) {
      return { status: 400, json: { error: error.message } }
    }
    throw error
  }
}
```

`isCursorQuery(query)` from `@dolusoft/query-protocol` is the type guard behind the two branches (it tests for the `cursor` key):

<!-- snippet: queries.ts#narrow -->
```ts
export function describePaging(query: Query): string {
  return isCursorQuery(query)
    ? `cursor ${query.cursor?.token ?? '(first page)'}`
    : `page ${query.page}`
}
```

## Where to go next

- [Using the plugins with TanStack Table](tanstack-plugins.md), for the other side of the wire.
- [Architecture](architecture.md), for how the three packages fit together.
- [The `tr-1` semantics profile](semantics.md), for what a query means when it is evaluated: matching, order, paging and errors.
- `contract/rules.md` in the repository: every behavior of the table as a numbered rule (C-01 to C-91), each covered by a test.
