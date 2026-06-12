/**
 * convertDataToInteger
 *
 * Safely converts an arbitrary value (typically a query-string parameter) to an
 * integer.  Returns `def` whenever the conversion is impossible.
 *
 * Common use cases:
 *   - Parsing `?last=50`    → convertDataToInteger(req.query.last, 10)
 *   - Parsing `/:table`     → convertDataToInteger(req.params.table, 1)
 *
 * @param data - The raw value to convert (string, number, undefined, etc.).
 * @param def  - Default value returned when `data` is undefined or non-numeric.
 * @returns    Integer parsed from `data`, or `def` on failure.
 *
 * Examples:
 *   convertDataToInteger("42",  1)  → 42
 *   convertDataToInteger("abc", 1)  → 1
 *   convertDataToInteger(undefined, 10) → 10
 */
export declare function convertDataToInteger(data: any, def: number): number;
/**
 * isValidTimestamp
 *
 * Returns true when `value` matches a timestamp format that PostgreSQL accepts
 * as a TIMESTAMPTZ literal.  Used to validate `from` / `to` query parameters
 * before they are interpolated into SQL WHERE clauses.
 *
 * Accepted formats (ISO 8601 / PostgreSQL compatible):
 *   - Date only            : "2026-06-08"
 *   - Date + hour:min      : "2026-06-08T17:43"   or  "2026-06-08 17:43"
 *   - Date + hour:min:sec  : "2026-06-08T17:43:00" or "2026-06-08 17:43:00"
 *   - Date + full precision: "2026-06-08T17:43:00.000"
 *
 * @param value - String to test.
 * @returns     true if the string is a recognisable timestamp; false otherwise.
 */
export declare function isValidTimestamp(value: string): boolean;
//# sourceMappingURL=helpers.d.ts.map