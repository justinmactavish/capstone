/*
 * routes/aggregate.ts
 *
 * GET /:sensor/summary
 *
 * Returns a single computed value for a named column in one of the Hbot tables.
 * Useful for dashboards that need an average, min, max, count, or sum without
 * pulling raw rows.
 *
 * URL segments:
 *   sensor  — one of: hbot-position | hbot-status | hbot-torque | cell-status
 *
 * Query parameters:
 *   col     — (required) column name to aggregate  e.g. ?col=x_torque
 *   fn      — avg | min | max | count | sum  (default: avg)
 *   from    — optional timestamp lower bound
 *   to      — optional timestamp upper bound
 *
 * Examples:
 *   GET /hbot-torque/summary?col=x_torque&fn=max
 *   GET /hbot-position/summary?col=y_pos&fn=avg&from=2026-06-08T17:00:00
 *   GET /cell-status/summary?col=finished_part_num&fn=max
 */
import express from 'express';
import { pool } from '../db.js';
import { VALID_TABLES, TABLE_COLUMNS, VALID_AGG_FUNCTIONS } from '../constants.js';
import { isValidTimestamp } from '../helpers.js';
export const aggregateRouter = express.Router();
aggregateRouter.get('/:sensor/summary', async (req, res, next) => {
    const sensorKey = String(req.params.sensor).toLowerCase();
    const tableName = VALID_TABLES[sensorKey];
    const validCols = TABLE_COLUMNS[sensorKey];
    if (!tableName) {
        res.status(400).json({
            error: `Unknown sensor "${req.params.sensor}". Valid options: ${Object.keys(VALID_TABLES).join(', ')}`
        });
        return;
    }
    const col = req.query.col ? req.query.col.toString() : '';
    const fn = req.query.fn ? req.query.fn.toString().toLowerCase() : 'avg';
    const from = req.query.from ? req.query.from.toString() : '';
    const to = req.query.to ? req.query.to.toString() : '';
    if (col === '') {
        res.status(400).json({ error: `'col' is required. Valid columns: ${validCols.join(', ')}` });
        return;
    }
    if (!validCols.includes(col)) {
        res.status(400).json({
            error: `Unknown column "${col}" for "${sensorKey}". Valid columns: ${validCols.join(', ')}`
        });
        return;
    }
    if (!VALID_AGG_FUNCTIONS.includes(fn)) {
        res.status(400).json({
            error: `Unknown function "${fn}". Valid options: ${VALID_AGG_FUNCTIONS.join(', ')}`
        });
        return;
    }
    if (from !== '' && !isValidTimestamp(from)) {
        res.status(400).json({ error: `Invalid 'from' value: "${from}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }
    if (to !== '' && !isValidTimestamp(to)) {
        res.status(400).json({ error: `Invalid 'to' value: "${to}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }
    // Build parameterised query
    const values = [];
    const conditions = [];
    if (from !== '') {
        values.push(from);
        conditions.push(`timestamp > $${values.length}`);
    }
    if (to !== '') {
        values.push(to);
        conditions.push(`timestamp < $${values.length}`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT ${fn.toUpperCase()}("${col}") AS result` +
        ` FROM public."${tableName}"` +
        (whereClause ? ` ${whereClause}` : '');
    console.log('Aggregate SQL:', sql, '| values:', values);
    try {
        const result = await pool.query(sql, values);
        res.json({
            data: {
                sensor: sensorKey,
                col,
                fn,
                result: result.rows[0]?.result ?? null,
            }
        });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=aggregate.js.map