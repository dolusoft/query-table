# The query protocol, for a backend

Full guide: `docs/guide/protocol.md`; JSON Schema: `packages/query-protocol/query.schema.json` (also `@dolusoft/query-protocol/query.schema.json`, draft 2020-12). You need no JavaScript to implement it.

## The query

| Key | Mode | Meaning |
| --- | --- | --- |
| `pageSize` | both | Rows per page, a whole number of at least 1. Set your own upper bound. |
| `sort` | both | `null` or one `{ field, direction }`, `direction` `"asc"` or `"desc"`. |
| `filters` | both | List of rules, `[]` for none. |
| `search` | optional | Global search text; absent means none, never `""`. |
| `page` | page mode | 1-based page number. |
| `cursor` | cursor mode | `null` for the first page, else `{ token, direction }`, `direction` `"next"` or `"prev"`. |

A query has exactly one of `page` and `cursor`. Extra top-level keys and extra rule properties are allowed and must be kept; extra keys inside `sort` and `cursor` are not.

```json
{
  "page": 1,
  "pageSize": 20,
  "sort": { "field": "joined", "direction": "desc" },
  "filters": [
    { "field": "name", "condition": "StartsWith", "value": "Ali" },
    { "field": "age", "condition": "GreaterThanOrEqual", "value": 18 }
  ],
  "search": "ankara"
}
```

```json
{
  "cursor": { "token": "eyJ0IjoiMjAyNi0xMC0wNiIsImlkIjo0Mn0=", "direction": "next" },
  "pageSize": 50,
  "sort": null,
  "filters": [{ "field": "level", "condition": "Equal", "value": "error" }]
}
```

## Conditions and values

Ten conditions: `Contains`, `NotContains`, `Equal`, `NotEqual`, `StartsWith`, `EndsWith`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`. `value` is a string, number or boolean.

| Column type | `value` | Offered conditions |
| --- | --- | --- |
| `string` | string | Contains, NotContains, Equal, NotEqual, StartsWith, EndsWith |
| `number`, `integer` | number | Equal, NotEqual, GreaterThan, GreaterThanOrEqual, LessThan, LessThanOrEqual |
| `date`, `datetime` | string (not validated by the table) | Equal, NotEqual, GreaterThan, LessThan |
| `bool` | boolean | Equal, NotEqual |

The schema accepts every condition with any value type. Refuse combinations you do not support (`Contains` on a number) with a 400.

## What the server must do

1. Validate the body against the schema; answer 400 on a mismatch.
2. Check every `field` of `filters` and `sort` against an allow-list and map it to a column. It is not trusted input; never concatenate it into SQL.
3. Evaluate rules: same `field` OR (AND when all of them are `NotEqual` or `NotContains`), different fields AND.
4. Decide what `search` matches and any minimum length. The query carries no column list.
5. Cap `pageSize`.
6. Answer:
   - page mode: the rows of the page and, if known, the total of the whole result (an unknown total is fine: a full page means "maybe more");
   - cursor mode: the rows and `cursors: { next, prev }`, each a token or `null` when there is no page on that side. Tokens are opaque; a forward-only backend can give no `prev` and the consumer keeps a stack of visited tokens (`docs/guide/examples/cursor-stack.ts`).

A page past the end is not an error: answer empty `rows` and the same total.

The change `reason` (`page`, `pageSize`, `sort`, `filter`, `reset`, `search`) is not part of the JSON; it reaches the server only if the consumer sends it.

## .NET

`docs/guide/examples/dotnet/` has records for the query (`Models.cs`, with `JsonExtensionData` to keep unknown keys), a `QueryValidator.cs` that validates with JsonSchema.Net against `query.schema.json`, and an endpoint. Copy the schema file into your project and keep it in step with the protocol version you target. The mode is decided from the JSON (`TryGetProperty("cursor", ...)`), because `cursor: null` and a missing `cursor` read the same into a C# property.
