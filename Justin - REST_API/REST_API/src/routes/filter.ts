/*
 * routes/filter.ts
 *
 * GET /:sensor/readings
 *
 * Returns raw rows from one of the Hbot wide-format tables, newest first.
 * Every row already contains all sensor values for that timestamp — there is
 * no EAV metric/value column.
 *
 * URL segments:
 *   sensor  — one of: hbot-position | hbot-status | hbot-torque | cell-status
 *
 * Query parameters (all optional):
 *   cols      — comma-separated list of data columns to include
 *               e.g. ?cols=x_pos,y_pos   (default: all columns for that table)
 *   from      — rows with timestamp after  this value  e.g. ?from=2026-06-08T17:43:00
 *   to        — rows with timestamp before this value  e.g. ?to=2026-06-08T18:00:00
 *   last      — max rows to return (default: 10, max: 1000)
 *   latest    — if "true", returns exactly one (the most recent) row
 *   order     — column to sort by: "timestamp" (default) or any valid data column
 *   dir       — sort direction: "desc" (default) or "asc"
 *
 *   Value filtering (all optional; requires val-col to name the target column):
 *   val-col   — which column to filter on  e.g. ?val-col=x_pos
 *   val-min   — only rows where val-col >= N
 *   val-max   — only rows where val-col <= N
 *   val-eq    — only rows where val-col = N
 *   val-neq   — only rows where val-col != N
 *   val-gt    — only rows where val-col > N
 *   val-lt    — only rows where val-col < N
 *
 * Examples:
 *   GET /hbot-position/readings?last=50
 *   GET /hbot-position/readings?cols=x_pos,y_pos&from=2026-06-08T17:00:00
 *   GET /hbot-torque/readings?val-col=x_torque&val-min=5&last=100
 *   GET /hbot-status/readings?latest=true
 *   GET /cell-status/readings?cols=running,finished_part_num&last=20
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import { VALID_TABLES, TABLE_COLUMNS, MAX_LIMIT } from '../constants.js';
import { convertDataToInteger, isValidTimestamp } from '../helpers.js';

export const filterRouter = express.Router();

filterRouter.get('/:sensor/readings', async (req: Request, res: Response, next: NextFunction) => {
    const sensorKey = String(req.params.sensor).toLowerCase();
    const tableName = VALID_TABLES[sensorKey];
    const validCols = TABLE_COLUMNS[sensorKey]!;

    if (!tableName) {
        res.status(400).json({
            error: `Unknown sensor "${req.params.sensor}". Valid options: ${Object.keys(VALID_TABLES).join(', ')}`
        });
        return;
    }

    // ── Parse parameters ──────────────────────────────────────────────────────

    // Optional column selection — validate each against the table's known columns
    let selectedCols: readonly string[] = validCols;
    if (req.query.cols) {
        const requested = req.query.cols.toString().split(',').map(c => c.trim()).filter(Boolean);
        const invalid   = requested.filter(c => !validCols.includes(c));
        if (invalid.length > 0) {
            res.status(400).json({
                error: `Unknown column(s) for "${sensorKey}": ${invalid.join(', ')}. ` +
                       `Valid columns: ${validCols.join(', ')}`
            });
            return;
        }
        selectedCols = requested;
    }

    const from   = req.query.from   ? req.query.from.toString()   : '';
    const to     = req.query.to     ? req.query.to.toString()     : '';
    const last   = Math.min(convertDataToInteger(req.query.last, 10), MAX_LIMIT);
    const latest = req.query.latest === 'true';

    // ORDER BY — only timestamp or a known data column (prevents injection)
    const orderColRaw = req.query.order ? req.query.order.toString() : 'timestamp';
    const orderCol    = (orderColRaw === 'timestamp' || validCols.includes(orderColRaw))
        ? orderColRaw : 'timestamp';
    const orderDir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    // Value filters
    const valColRaw = req.query['val-col'] ? req.query['val-col'].toString() : null;
    const valMin    = req.query['val-min'] !== undefined ? parseFloat(req.query['val-min'] as string) : null;
    const valMax    = req.query['val-max'] !== undefined ? parseFloat(req.query['val-max'] as string) : null;
    const valEq     = req.query['val-eq']  !== undefined ? parseFloat(req.query['val-eq']  as string) : null;
    const valNeq    = req.query['val-neq'] !== undefined ? parseFloat(req.query['val-neq'] as string) : null;
    const valGt     = req.query['val-gt']  !== undefined ? parseFloat(req.query['val-gt']  as string) : null;
    const valLt     = req.query['val-lt']  !== undefined ? parseFloat(req.query['val-lt']  as string) : null;

    // ── Validate ──────────────────────────────────────────────────────────────

    if (from !== '' && !isValidTimestamp(from)) {
        res.status(400).json({ error: `Invalid 'from' value: "${from}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }
    if (to !== '' && !isValidTimestamp(to)) {
        res.status(400).json({ error: `Invalid 'to' value: "${to}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }

    // Validate val-col before applying value filters
    const hasValueFilter = [valMin, valMax, valEq, valNeq, valGt, valLt].some(v => v !== null);
    let valCol: string | null = null;
    if (hasValueFilter) {
        if (!valColRaw) {
            res.status(400).json({ error: `'val-col' is required when using value filters. Valid columns: ${validCols.join(', ')}` });
            return;
        }
        if (!validCols.includes(valColRaw)) {
            res.status(400).json({
                error: `Unknown val-col "${valColRaw}" for "${sensorKey}". Valid columns: ${validCols.join(', ')}`
            });
            return;
        }
        valCol = valColRaw;
    }

    // Reject NaN from non-numeric inputs
    for (const [name, v] of [['val-min', valMin], ['val-max', valMax], ['val-eq', valEq],
                              ['val-neq', valNeq], ['val-gt', valGt], ['val-lt', valLt]] as [string, number|null][]) {
        if (v !== null && isNaN(v)) {
            res.status(400).json({ error: `'${name}' must be a number.` });
            return;
        }
    }

    // ── Build parameterised query ─────────────────────────────────────────────

    const values: any[]        = [];
    const conditions: string[] = [];

    if (from !== '') { values.push(from); conditions.push(`timestamp > $${values.length}`); }
    if (to   !== '') { values.push(to);   conditions.push(`timestamp < $${values.length}`); }

    // Value conditions — applied to the named column
    if (valCol) {
        if (valEq  !== null) { values.push(valEq);  conditions.push(`"${valCol}" = $${values.length}`);  }
        if (valNeq !== null) { values.push(valNeq); conditions.push(`"${valCol}" != $${values.length}`); }
        if (valMin !== null) { values.push(valMin); conditions.push(`"${valCol}" >= $${values.length}`); }
        if (valMax !== null) { values.push(valMax); conditions.push(`"${valCol}" <= $${values.length}`); }
        if (valGt  !== null) { values.push(valGt);  conditions.push(`"${valCol}" > $${values.length}`);  }
        if (valLt  !== null) { values.push(valLt);  conditions.push(`"${valCol}" < $${values.length}`);  }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Always include id and timestamp; then the selected data columns
    const colList = ['id', 'timestamp', ...selectedCols].map(c => `"${c}"`).join(', ');

    const sql = latest
        ? `SELECT ${colList} FROM public."${tableName}" ${whereClause} ORDER BY timestamp DESC LIMIT 1`
        : `SELECT ${colList} FROM public."${tableName}" ${whereClause}` +
          ` ORDER BY "${orderCol}" ${orderDir} LIMIT ${last}`;

    console.log('Filter SQL:', sql, '| values:', values);

    try {
        const result = await pool.query(sql, values);
        res.json({ data: result.rows });
    } catch (err) {
        next(err);
    }
});
