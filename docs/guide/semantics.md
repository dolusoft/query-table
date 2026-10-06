# The `tr-1` semantics profile

> Draft: tr-1 freezes with 3.1.0.

This document is the meaning of a `Query` when it is evaluated over a set of rows under the semantics profile `tr-1`: what a filter matches, in which order rows are sorted, how a page is cut and which error comes first. It is the authority for every implementation: the local evaluator in `@dolusoft/query-protocol/local`, a .NET evaluator, and any server endpoint that claims the profile. Where an implementation departs from this text, the implementation is fixed. The decision behind it is [ADR 0008](../decisions/0008-local-query-evaluation.md).

The table itself never evaluates a query (P1); it draws the rows it is given. The shape of the query is in the [protocol guide](protocol.md).

The unit of text is the **UTF-16 code unit** (`charCodeAt` in JavaScript, `char` in .NET). Constructs that walk code points, such as `for…of` over a string, are not used. Substring, prefix, suffix and equality tests are **ordinal** (`StringComparison.Ordinal` in .NET; culture-sensitive overloads are never used).

The numbers in parentheses, such as (case C27), name the cases of the conformance suite that pin a sentence down; `C-nn` names a behavior rule in [`contract/rules.md`](../../contract/rules.md).

## Source context

- `allRows` is the complete and authoritative set of rows of the **resolved source context**: the time range, the sources, the scope of the user's permissions and the source's own limits, such as a `maxRows`. The evaluator cannot tell that it was given one page or a cut-down subset; that is the caller's obligation.
- Unknown top-level keys of the query that are not reserved (`timeRange`, `sources`, …) are part of that context. The evaluator ignores them because they are **already applied** to `allRows`, not because they mean nothing. When the context changes, the source supplies a new `allRows` snapshot (a new array object); the old snapshot is no longer valid.
- Default order: with `sort: null` the result is in the order of `allRows`. The source must supply the default order of the endpoint that will later serve the same table; where needed it supplies the rows sorted by a stable order field (case C56).

## Reading values

- A field's value is read with the field's `get(row)`, or else by the dotted path of the field name: the name is split at `.`, and each step is a case-sensitive property read, the same way the table reads a cell (C-30); an array index is read as `items.0`. When a step meets a null or missing value, the result is **missing**. A property whose name contains a dot cannot be read by path; it needs a `get`. Field names are not normalized.
- In JavaScript a path step reads own and inherited properties, as the table does; use names that are not on `Object.prototype`. A .NET evaluator sees only the row's own properties.
- `undefined`, missing and `null` are the same: **null**. No other value is null (`''`, `0` and `false` are not).
- `get` is synchronous, deterministic and free of side effects; in one evaluation it is called **at most once** per row for each field that is used. If it throws, the result is `invalid-data` (`field`, `row`). If it returns a promise, that does not fit the type and is `invalid-data` too.
- Before evaluation starts, the **used** fields of every row (in the order of [Validation order](#validation-order)) are type-checked; the first value that does not fit is `invalid-data`. Fields that are not used are not read (case C27). When a row is not an object, all of its fields are missing; its `key` is then null, which is `invalid-data`.

## Text

### Malformed UTF-16

Malformed UTF-16 is refused: a used data value that contains an unpaired surrogate (U+D800–U+DFFF) is `invalid-data`; a rule value or a search text that contains one is `invalid-value`. The check comes before composition, and it applies to every used `string` value, the `key` included.

### Composition table

There is **no Unicode normalization**. In its place is a closed **composition table** `C`: the text is walked from left to right; when a code unit and the unit after it are one of the pairs below, the two are replaced by one unit, and the walk continues after the pair (no overlaps, one pass).

| Pair                | Result     |     | Pair                | Result     |
| ------------------- | ---------- | --- | ------------------- | ---------- |
| `I` U+0049 + U+0307 | `İ` U+0130 |     |                     |            |
| `C` U+0043 + U+0327 | `Ç` U+00C7 |     | `c` U+0063 + U+0327 | `ç` U+00E7 |
| `G` U+0047 + U+0306 | `Ğ` U+011E |     | `g` U+0067 + U+0306 | `ğ` U+011F |
| `O` U+004F + U+0308 | `Ö` U+00D6 |     | `o` U+006F + U+0308 | `ö` U+00F6 |
| `S` U+0053 + U+0327 | `Ş` U+015E |     | `s` U+0073 + U+0327 | `ş` U+015F |
| `U` U+0055 + U+0308 | `Ü` U+00DC |     | `u` U+0075 + U+0308 | `ü` U+00FC |

- Sequences that are not in the table stay as they are: `i` + U+0307 (what JavaScript's `"İ".toLowerCase()` gives), `e` + U+0301, Hangul and every other canonical equivalent do not compose. The reason: the table depends on no runtime and no Unicode version, and .NET in invariant globalization mode writes it line for line the same.
- Composition applies to data values, rule values and the search text. It does **not** apply to the `key`: a row's identity is raw and ordinal ([Sorting and identity](#sorting-and-identity)).
- Only the search text is trimmed ([Composition and search](#composition-and-search)). Data and rule values are not trimmed; a rule value made only of spaces is valid (it is not empty text). Inner spaces stay as they are. Accents are not folded: `é ≠ e`, `ç ≠ c`.

## Folding

Folding applies to composed text and maps one code unit to one code unit (composition can shorten a text; folding never changes its length). A code unit that is not in a table folds to itself.

**The sort fold `S`** (Turkish upper case to lower case, 32 mappings):

| Upper | `A B C Ç D E F G Ğ H I İ J K L M N O Ö P Q R S Ş T U Ü V W X Y Z` |
| ----- | ----------------------------------------------------------------- |
| Lower | `a b c ç d e f g ğ h ı i j k l m n o ö p q r s ş t u ü v w x y z` |

`I` U+0049 → `ı` U+0131; `İ` U+0130 → `i` U+0069; `Ç` → U+00E7; `Ğ` → U+011F; `Ö` → U+00F6; `Ş` → U+015F; `Ü` → U+00FC; every other ASCII capital letter + 0x20.

**The match fold `M`** is `S` first, then `ı` U+0131 → `i` U+0069. All four of `I`, `ı`, `İ` and `i` become `i`. This is a deliberate **search equivalence**, not only insensitivity to Turkish letter case: `sık` and `sik` are the same to a match. It reaches every text condition, `Equal` and `NotEqual` included, and the search; it does not reach row identity or permission identifiers.

## Text order

Two texts `a` and `b` are composed first (`C`), then compared:

1. **Primary:** `S(C(a))` and `S(C(b))`, code unit by code unit. The class of a unit is taken from the **folded** unit:
   - Class 0: units in U+0000–U+007F that are neither letters nor digits, by code unit value.
   - Class 1: `0`–`9`, by value.
   - Class 2: the 32 letters in this order: `a b c ç d e f g ğ h ı i j k l m n o ö p q r s ş t u ü v w x y z`.
   - Class 3: every other code unit (surrogates included), by code unit value.

   The class decides first, then the order inside the class; the first unit that differs decides. When one text is a prefix of the other, the shorter one comes first.

2. **Tertiary:** when the primary level is equal, `C(a)` and `C(b)` ordinally (`String.CompareOrdinal`). **Two different composed texts are never equal.** `I` + U+0307 + `pek` and `İpek` compose to the same text, and the tie is broken by the `key`.

Consequences: `"50%_off" < "Ankara" < "IĞDIR" < "Iğdır" < "ırmak" < "Istanbul" < "istanbul" < "İzmir"`; `"ALİ" < "Ali" < "ali"` (case C44). Numbers inside text are not numbers: `"dosya10" < "dosya2"`, `"1072" < "128"` (case C36).

Sorting separates `ı` from `i`; matching does not. These are two separate decisions, and both are fixed.

## Types

| Field type | Data value (other than null)                                                          | Rule value                                                                     | Comparison                                       |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| `string`   | `string`, well-formed UTF-16                                                          | non-empty `string`, well-formed                                                | match `M(C(·))`, order [Text order](#text-order) |
| `number`   | finite IEEE-754 binary64 (`NaN`, `±Infinity` → `invalid-data`)                        | finite `number`                                                                | numeric; `-0 = 0`; no tolerance                  |
| `integer`  | a whole number in −(2⁵³−1)…2⁵³−1                                                      | the same range (`2.5`, `2⁵³` → `invalid-value`)                                | numeric                                          |
| `bool`     | `boolean`                                                                             | `boolean`                                                                      | `false < true`                                   |
| `date`     | `YYYY-MM-DD`, a valid day                                                             | the same form; a `datetime` form is `invalid-value`                            | chronological                                    |
| `datetime` | the [grammar](#calendar-and-time); without an offset only when the field has `offset` | an instant with an offset; with `offset`, an instant without one or a day only | instant (signed int64 UTC ms)                    |

- There is no type conversion: a rule `"25"` on a `number` field is `invalid-value`, a data value `25` on a `string` field is `invalid-data`. Declaring a field `number` does not turn the text `"1072"` into a number; the source must supply a real number. A formatted value (`"1,5 GB"`) is never compared.
- The `integer` bound is stricter than the filter grammar's: `parseDraft` (`grammar/draft.ts`) uses `Number.isInteger`, the evaluator `Number.isSafeInteger`. This is a limit of evaluation; the grammar does not change.
- In .NET, `number` is read as `double` and `integer` as `long` (with the range check).

### Calendar and time

```text
date      = YYYY "-" MM "-" DD
datetime  = date ("T" / " ") HH ":" mm [":" ss ["." frac]] [offset]
frac      = 1*9DIGIT
offset    = "Z" / ("+" / "-") HH ":" MM
```

- Only this form. Upper-case `T` and `Z` (lower-case `t` and `z` are refused); leading or trailing space, or any extra character, is refused (case C52). The space separator is exactly one U+0020.
- **Calendar:** proleptic Gregorian, year 0001–9999, month 01–12, day up to the number of days of the month; a leap year is one divisible by 4, except one divisible by 100 and not by 400 (`2000-02-29` is valid, `2100-02-29` is not). Hour 00–23, minute 00–59, second 00–59 (no leap second, no `24:00`). An invalid component is refused **before conversion**; no engine's date overflow may turn an invalid day into a valid one.
- **Offset:** `Z` = `+00:00`; hour 00–14, minute 00–59, total at most 14:00 (`+14:01` is refused); `-00:00` is refused (in RFC 3339 it means "offset unknown"). The same grammar holds for the `offset` setting of a field (`defineDataset` throws).
- **Fraction:** handled on the text: shorter than 3 digits, it is padded with `0` on the right; longer, its first 3 digits are taken (no rounding). Then it is computed. So `.9999` = `.999`, before the epoch too (`1969-12-31T23:59:59.9999Z` = `…59.999Z`; there is no truncation toward zero, case C52). The same reduction applies to data and rule values.
- **Conversion:** `Date.UTC` and `Date.parse` are not used (`Date.UTC(1, 0, 1)` gives 1901, `Date.UTC(2026, 1, 30)` overflows into March). The day number is computed with the days-from-civil algorithm (Hinnant); the instant = day × 86 400 000 + hours, minutes, seconds and milliseconds − offset minutes × 60 000, a signed 64-bit integer (in JavaScript it stays within the safe integer range). With the offset applied, the UTC instant can fall slightly outside 0001–9999; that is valid.
- **The `offset` field setting** is a fixed offset, not a time zone: it applies the same offset to every day and does not reproduce the historical rules of `Europe/Istanbul`. Türkiye has used a fixed `+03:00` since 2016.
- **Data:** a value with an offset is taken as it is; a value without an offset is read in the field's `offset`, or is `invalid-data` when the field has none. An explicit offset is never reinterpreted.
- **Rule:** an instant with an offset; with `offset`, an instant without one is read in it; a **day only** `D` means, with `offset`, the half-open day `[start, end)`: start = `D 00:00` in the offset, end = the next day `00:00` in the offset. Without `offset`, a day only and an instant without an offset are `invalid-value`.

| Condition            | Day only `D`              | Instant `t₀`              |
| -------------------- | ------------------------- | ------------------------- |
| `Equal`              | start ≤ t < end           | t = t₀ (ms)               |
| `NotEqual`           | the complement of `Equal` | the complement of `Equal` |
| `GreaterThan`        | t ≥ end                   | t > t₀                    |
| `GreaterThanOrEqual` | t ≥ start                 | t ≥ t₀                    |
| `LessThan`           | t < start                 | t < t₀                    |
| `LessThanOrEqual`    | t < end                   | t ≤ t₀                    |

## Condition by type

✓ allowed, ✗ `unsupported-operator`.

| Condition                                                          | `string`                | `number` / `integer` | `bool` | `date` / `datetime` |
| ------------------------------------------------------------------ | ----------------------- | -------------------- | ------ | ------------------- |
| `Contains`, `NotContains`, `StartsWith`, `EndsWith`                | ✓                       | ✗                    | ✗      | ✗                   |
| `Equal`, `NotEqual`                                                | ✓                       | ✓                    | ✓      | ✓                   |
| `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual` | ✗                       | ✓                    | ✗      | ✓                   |
| `IsNull`, `IsNotNull` (reserved)                                   | `unsupported-extension` | ←                    | ←      | ←                   |
| an unknown condition                                               | `unsupported-operator`  | ←                    | ←      | ←                   |

The table's filter menu does not offer `GreaterThanOrEqual` and `LessThanOrEqual` on dates, but the protocol allows them and so does the evaluator. Order conditions on text are deliberately absent.

**Text conditions** (`a` = `M(C(data))`, `v` = `M(C(rule))`): `Contains` is `v` as an ordinal substring of `a`; `StartsWith` and `EndsWith` are an ordinal prefix and suffix; `Equal` is ordinal equality. **No wildcards:** `%`, `_`, `*` and `?` are plain characters.

**Null and conditions:** the positive conditions (`Contains`, `StartsWith`, `EndsWith`, `Equal` and the four order conditions) are **false** on null; the negative conditions (`NotEqual`, `NotContains`) are the **exact complement** of their positive pair and **true** on null. In SQL: `(col IS NULL OR col <> @v)`. `''` is not null (case C37).

## Composition and search

- **Composition (C-17):** rules are grouped by field; a group whose rules are all negative combines with AND, any other group with OR; groups combine with AND. The order of groups and rules does not change the result (case C62). Repeating a rule does not change the result.
- **The range trap:** `age > 20` and `age < 40` on one field combine with OR; the result is every age that is not null. A bounded range cannot be expressed in 3.x (case C20).
- **A group of mixed signs** (`Equal ali`, `NotContains e`) combines with OR (case C18).
- **Search:** when `search` is absent, `null`, or empty after trimming, **there is no search and no error**, also on a dataset without a search field (case C53). The trim set is U+0009–U+000D, U+0020 and U+00A0, an explicit list because JavaScript's `trim()` and .NET's `Trim()` use different sets; other spaces, such as U+2003, are not trimmed. Order: UTF-16 check → trim → composition → `M`. The trimmed text is one needle (it is not split into words). A row matches when the `M(C(value))` of one of its `search: true` fields contains the needle; a null field does not match. The search combines with the filters by AND. An active search on a dataset without a search field is `search-not-supported`.

## Sorting and identity

- `sort: null` → the order of `allRows` ([Source context](#source-context); case C56).
- With a `sort`, values are ordered by the comparison of their type. Null is the smallest: first in `asc`, last in `desc`.
- `desc` reverses the whole value comparison, the tertiary level included.
- Equal values are broken by **`key` ascending**, whatever the direction. Comparing keys: an `integer` key numerically; a `string` key by the ordinal UTF-16 order of the **raw** value (no composition, no folding): `"1" < "10" < "2"`, and `"é"` and `"e"` + U+0301 are two different identities (case C57).
- The `key` must be unique; a repeat is `duplicate-key` (`field`, `row` = the index of the second occurrence), even on a row that is filtered out or off the page. A null `key` is `invalid-data`.
- The result is total: the same input gives the same order on every engine.

## Paging

- Page mode only. A `cursor` key in the query, even `null`, is `cursor-not-supported`.
- `page` and `pageSize` are safe integers ≥ 1; otherwise (missing, `"1"`, `1.5`, `0`) `invalid-page`. There is no upper bound.
- `totalRows` = the number of rows after filtering and search, independent of the page.
- The page is the slice `[(page − 1) · pageSize, page · pageSize)` of the sorted list. To avoid overflow, an implementation first returns an empty page when `page − 1 ≥ ⌈n / pageSize⌉` (in .NET with `long` and `checked`; case C64). A page past the end gives empty `rows` and the same `totalRows`; `page` is not corrected.
- `paginate: false` → the whole sorted list; `cursor`, `page` and `pageSize` are still validated.

## Validation order

The first error is looked for in this order. Query errors are found without looking at the rows; an empty dataset does not hide a broken query.

1. **Preconditions** (these throw; they are not a result): the `dataset` is branded by `defineDataset`; `options` is an object, `paginate` is a boolean or absent.
2. **Profile:** `options.profile` is not in this build → `unknown-profile`.
3. **Query shape:** `query` is not a plain object → `invalid-query` (`path: ''`).
4. **Cursor:** a `cursor` key → `cursor-not-supported` (`path: '/cursor'`).
5. **Page:** first `page`, then `pageSize` → `invalid-page` (`path`).
6. **Reserved keys:** `sorts`, `any`, `group`, `aggregates`, in this order → `unsupported-extension` (`name`, `path`).
7. **Sort:** no `sort` key → `invalid-query` (`/sort`); not null and not an object → `/sort`; `field` not a non-empty string → `/sort/field`; the field does not exist → `unknown-field`; `sortable: false` → `unsupported-field`; `direction` not `asc` or `desc` → `invalid-query` (`/sort/direction`).
8. **Rules:** `filters` not an array → `invalid-query` (`/filters`). Each rule in array order: not an object (`/filters/i`), `field` not a non-empty string, `condition` not a string, `value` not a string, number or boolean → `invalid-query` (the matching `path`); the field does not exist → `unknown-field`; `filterable: false` → `unsupported-field`; `IsNull` or `IsNotNull` → `unsupported-extension`; the condition is unknown or not allowed on the type → `unsupported-operator`; the value does not fit the type or form, is empty, or is malformed UTF-16 → `invalid-value`.
9. **Search:** `search` is present, not null and not a string → `invalid-query` (`/search`); malformed UTF-16 → `invalid-value` (`/search`); not empty after trimming and the dataset has no search field → `search-not-supported`.
10. **Rows**, in array order; in each row the used fields in this order, each field once: `sort.field` → the fields of the rules, in rule order → with an active search, the search fields in **ordinal name order** → `key`. Each value is read with `get` or by path; a read error or a type mismatch is `invalid-data`; a null `key` is `invalid-data`; a `key` seen before is `duplicate-key` at that point.

The order in which `dataset.fields` is written carries no meaning anywhere (JavaScript moves integer-like keys first, and a .NET dictionary does not keep an order).

## Errors

- **Three kinds:** (a) a definition error (a malformed definition given to `defineDataset`) and a precondition error (an unbranded `dataset`, malformed `options`) are programming errors and throw `TypeError`; (b) query errors and (c) data errors (a `get` that throws included) are **returned as a value** (`{ ok: false, error }`).
- **No partial result.** When there is an error there are no `rows`. `useLocalQuery` gives `rows: []`, `totalRows: 0` and the `error` while there is one; the consumer shows the error apart from an empty result.
- **Nothing is ignored silently**, with two deliberate exceptions: unknown top-level keys that are not reserved ([Source context](#source-context)) and extra properties of a rule (carried, not meant; C-60).

| Code                    | When                                                                                                                                         | Extra fields                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `unknown-profile`       | `options.profile` is not in this build                                                                                                       | —                                                   |
| `invalid-query`         | the shape of the query, the sort, the rule list, a rule or the search is broken; `sort` is missing; an invalid `direction`                   | `path`, on a rule `rule`                            |
| `cursor-not-supported`  | a `cursor` key in the query                                                                                                                  | `path`                                              |
| `invalid-page`          | `page` or `pageSize` is not a safe integer ≥ 1                                                                                               | `path`                                              |
| `unsupported-extension` | a reserved top-level key that is refused, or a reserved condition                                                                            | `name`, `path`, on a rule `field` and `rule`        |
| `unknown-field`         | `sort.field` or a rule's field is not in the `dataset`                                                                                       | `field`, `path`, on a rule `rule`                   |
| `unsupported-field`     | the field exists but is `sortable: false` or `filterable: false`                                                                             | `field`, `path`, on a rule `rule`                   |
| `unsupported-operator`  | the condition is not allowed on this type, or is unknown                                                                                     | `field`, `rule`, `path`                             |
| `invalid-value`         | the rule value does not fit the type or form, empty text, malformed UTF-16, a day or local instant without `offset`; a malformed search      | `field`, `rule`, `path` (on the search `path` only) |
| `search-not-supported`  | an active search, but no search field                                                                                                        | `path`                                              |
| `invalid-data`          | a used row value does not fit the type, malformed UTF-16, a `datetime` without an offset (field without `offset`), `get` threw, a null `key` | `field`, `row`                                      |
| `duplicate-key`         | two rows have the same `key` value                                                                                                           | `field`, `row`                                      |

`path` is a JSON Pointer into the query (`/filters/2/value`); `''` is the query itself. `rule` is the index into `query.filters`, `row` the zero-based index into `allRows`, `name` the key or condition of an `unsupported-extension`. The codes and the location fields are part of the conformance suite; `message` is not (it is English, for logs, never shown as it is and never compared). The codes **do not imply an HTTP status**: query errors may map to 400, while broken stored data and a repeated identity are server or data errors; the backend adapter decides the mapping.

## Versioning

There are four separate versions; none implies another.

| What              | Form                                                                   | Where it lives                                                                     | When it changes                                                                                  |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Package           | semver, the three packages in lockstep (ADR 0006)                      | `package.json`                                                                     | every release; adding `/local` is a minor (3.1.0)                                                |
| Query JSON shape  | **no version number**: the `$id` of `query.schema.json` is unversioned | the manifest's `querySchema.sha256` pins the schema the cases were written against | when the schema breaks (with a major); a real wire version policy belongs to the envelope record |
| Semantics profile | a name: `tr-1`, `tr-2`, …                                              | the `profiles` constant, this document                                             | a new profile is a new name (a minor)                                                            |
| Conformance suite | `revision`, an integer; separately `fixtureFormat`                     | the manifest, the release notes                                                    | on every change of meaning (a case added or withdrawn, a data or format change)                  |

Rules:

- **The meaning of a profile never changes.** Where code departs from this document, the code is fixed (a patch); the document and the cases stay as they are.
- When an ambiguity is found in this document, the intended reading is written into it, and **every** implementation (TypeScript, .NET, servers) is judged by it. The current behavior of the TypeScript evaluator is evidence, not authority. A reading that changes the result of a published case is a new profile.
- This document carries the "Draft" line until the filters and the search of the local evaluator are merged; `tr-1` freezes with the 3.1.0 release.
- A new profile comes in a minor release; an old profile stays at least until the next major; removing one happens only in a major, with a decision record.
- The profile is not part of the wire. Which profile to evaluate with is the data source's knowledge.
- "This endpoint is `tr-1` conformant" means it passes the suite with **zero applicable failures**; a pass with an allowlist is "partially aligned".

### Reserved names

| Name                  | Kind                      | Evaluator                                    | A possible future meaning          |
| --------------------- | ------------------------- | -------------------------------------------- | ---------------------------------- |
| `sorts`               | top-level key             | `unsupported-extension`                      | ordered multi-column sort          |
| `any`                 | top-level key             | `unsupported-extension`                      | OR across fields, a predicate tree |
| `group`               | top-level key             | `unsupported-extension`                      | grouping                           |
| `aggregates`          | top-level key             | `unsupported-extension`                      | aggregates and a result schema     |
| `columns`             | top-level key             | ignored (reserved in the documentation only) | projection                         |
| `range`               | top-level key             | ignored (reserved in the documentation only) | bounded ranges                     |
| `IsNull`, `IsNotNull` | condition (internal list) | `unsupported-extension`                      | explicit null predicates           |

- The list of refused names is **frozen** for 3.x; it is not a way to grow the query. These names live in the open extension namespace and do not negotiate capabilities.
- The table keeps carrying these keys, as it carries any unknown key (C-60). Do not use them for your own extensions.
- **Future execution forms** (multi-column sort, OR, grouping, …) do not go into `Query`; they go into a **versioned execution envelope** that older evaluators refuse explicitly. That envelope is a decision record of its own. A general `version` key is not reserved.

## Implementing in .NET

The profile is written so that a .NET evaluator can follow it line by line, including in containers that run with `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`, where `Normalize()` returns the text unchanged and culture-aware comparisons fall back to ordinal ones.

- **Text is `char`, not `Rune`.** Walk a string with an index over its `char`s. Check for unpaired surrogates with `char.IsHighSurrogate` and `char.IsLowSurrogate` before anything else.
- **`C`, `S` and `M` are `switch` statements on `char`**, written from the tables above. Do not use `ToLowerInvariant`, `ToUpperInvariant`, `ToLower(culture)`, `Normalize()`, `CompareInfo` or `StringComparer.Create(culture, …)`: none of them gives `tr-1`, and in invariant mode they give something else again.

```csharp
// C: compose one pair of code units, or return '\0' when the pair is not in the table.
static char Compose(char c, char mark) => (c, mark) switch
{
    ('I', '̇') => 'İ',
    ('C', '̧') => 'Ç', ('c', '̧') => 'ç',
    ('G', '̆') => 'Ğ', ('g', '̆') => 'ğ',
    ('O', '̈') => 'Ö', ('o', '̈') => 'ö',
    ('S', '̧') => 'Ş', ('s', '̧') => 'ş',
    ('U', '̈') => 'Ü', ('u', '̈') => 'ü',
    _ => '\0'
};

// S: the sort fold of one composed code unit.
static char FoldSort(char c) => c switch
{
    'I' => 'ı',
    'İ' => 'i',
    'Ç' => 'ç',
    'Ğ' => 'ğ',
    'Ö' => 'ö',
    'Ş' => 'ş',
    'Ü' => 'ü',
    >= 'A' and <= 'Z' => (char)(c + 0x20),
    _ => c
};

// M: the match fold.
static char FoldMatch(char c)
{
    char s = FoldSort(c);
    return s == 'ı' ? 'i' : s;
}
```

- **Comparisons are ordinal.** Substring, prefix, suffix and equality on folded text use `IndexOf`, `StartsWith`, `EndsWith` and `Equals` with `StringComparison.Ordinal`; the tertiary level of [Text order](#text-order) and `string` keys use `String.CompareOrdinal`.
- **Trimming uses the listed set**, U+0009–U+000D, U+0020 and U+00A0, for example `text.Trim(trimSet)` with that `char[]`; the parameterless `Trim()` removes more.
- **Numbers:** `number` is `double`, `integer` is `long` after a range check against ±(2⁵³ − 1); `-0.0 == 0.0` holds already.
- **Times are parsed by hand** from the grammar: no `DateTime.Parse`, `DateTimeOffset.Parse` or `ParseExact`, which accept forms the profile refuses. The fraction is cut on the text (pad to 3 digits with `0`, or take the first 3), never rounded. The day number comes from days-from-civil, and the instant is a `long` of milliseconds:

```csharp
// Days since 1970-01-01 of a proleptic Gregorian date (Hinnant's days_from_civil).
static long DaysFromCivil(long y, long m, long d)
{
    y -= m <= 2 ? 1 : 0;
    long era = (y >= 0 ? y : y - 399) / 400;
    long yoe = y - era * 400;
    long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
    long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
}
```

- **Paging uses `long` and `checked`.** Return an empty page when `page - 1 >= ceil(n / pageSize)`, computed as `n == 0 ? 0 : (n - 1) / pageSize + 1`, before multiplying; then `checked((page - 1) * pageSize)` cannot overflow.
- **Reading values** sees only the row's own properties (see [Reading values](#reading-values)); keep field names off the names JavaScript inherits from `Object.prototype`, so both sides read the same thing.
