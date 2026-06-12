/*
 * routes/redline.ts
 *
 * GET /hbot-torque/redline
 *
 * Torque wear / redline analysis for the H-Bot.  The Hbot_Torque table stores
 * three torque axes per row: x_torque, y_torque, z_torque.  For each axis this
 * endpoint determines the historical peak torque and reports how often a recent
 * window of readings exceeds a configurable percentage of that peak.
 *
 * Algorithm (same as before, adapted for wide-table columns):
 *   1. Query MAX and MIN of the axis column across all historical data.
 *   2. peakTorque = max(abs(MAX), abs(MIN))  — handles both spin directions.
 *   3. redlineThreshold = peakTorque × (thresholdPercent / 100)
 *   4. Fetch the last N rows (or within a time window).
 *   5. Count rows where abs(axis value) > redlineThreshold.
 *   6. Return count, percentage, status level, and latest reading.
 *
 * Status levels:
 *   normal  — < 10 % of analysed rows in redline
 *   warning — 10–25 % in redline
 *   danger  — > 25 % in redline
 *
 * Query parameters (all optional):
 *   axis       — x_torque | y_torque | z_torque  (default: all three)
 *   from       — only consider rows after this timestamp
 *   to         — only consider rows before this timestamp
 *   last       — number of recent rows to analyse (default: 100, max: 1000)
 *   threshold  — redline % of peak torque, 1–100  (default: 80)
 *
 * Examples:
 *   GET /hbot-torque/redline
 *   GET /hbot-torque/redline?axis=x_torque
 *   GET /hbot-torque/redline?axis=y_torque&last=200&threshold=75
 *   GET /hbot-torque/redline?from=2026-06-08T17:00:00&to=2026-06-08T18:00:00
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { pool, config } from '../db.js';
import { convertDataToInteger, isValidTimestamp } from '../helpers.js';
import { TORQUE_AXES } from '../constants.js';

export const redlineRouter = express.Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const TORQUE_TABLE = 'Hbot_Torque';

const DEFAULT_THRESHOLD_PERCENT: number = config.redline?.thresholdPercent ?? 80;
const WARNING_PERCENT: number           = config.redline?.warningPercent   ?? 10;
const DANGER_PERCENT:  number           = config.redline?.dangerPercent    ?? 25;

// ── Helper: status level ──────────────────────────────────────────────────────
function statusLevel(pct: number): string {
    if (pct >= DANGER_PERCENT)  return 'danger';
    if (pct >= WARNING_PERCENT) return 'warning';
    return 'normal';
}

// ── Helper: analyse a single torque axis ──────────────────────────────────────
async function analyseAxis(
    axis: string,
    thresholdPercent: number,
    from: string,
    to: string,
    last: number
): Promise<object> {

    // Step 1: Historical peak for this axis column
    const peakSql =
        `SELECT MAX("${axis}") AS max_val, MIN("${axis}") AS min_val` +
        ` FROM public."${TORQUE_TABLE}"`;
    console.log('Redline peak SQL:', peakSql);
    const peakResult = await pool.query(peakSql);

    const maxVal: number = parseFloat(peakResult.rows[0]?.max_val ?? 0);
    const minVal: number = parseFloat(peakResult.rows[0]?.min_val ?? 0);

    // Step 2: Independent thresholds for each direction.
    //   positiveLimit = historical MAX * (threshold% / 100)
    //   negativeLimit = historical MIN * (threshold% / 100)  (stays negative)
    // A reading is in redline if value >= positiveLimit OR value <= negativeLimit.
    const positiveLimit: number = maxVal * (thresholdPercent / 100);
    const negativeLimit: number = minVal * (thresholdPercent / 100);

    // Step 3: Fetch analysis window
    const values: any[]        = [];
    const conditions: string[] = [];

    if (from !== '') { values.push(from); conditions.push(`timestamp > $${values.length}`); }
    if (to   !== '') { values.push(to);   conditions.push(`timestamp < $${values.length}`); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const windowSql =
        `SELECT "${axis}", timestamp FROM public."${TORQUE_TABLE}"` +
        ` ${whereClause} ORDER BY timestamp DESC LIMIT ${last}`;

    console.log('Redline window SQL:', windowSql, '| values:', values);
    const windowResult = await pool.query(windowSql, values);
    const readings = windowResult.rows;

    // Step 4: Count redline events — exceeds positive limit OR drops below negative limit
    const redlineReadings = readings.filter((r: any) => {
        const v = parseFloat(r[axis]);
        return v >= positiveLimit || v <= negativeLimit;
    });

    const totalReadings  = readings.length;
    const redlineCount   = redlineReadings.length;
    const redlinePercent = totalReadings > 0
        ? parseFloat(((redlineCount / totalReadings) * 100).toFixed(1))
        : 0;

    // Step 5: Latest and oldest readings (window is ordered newest → oldest)
    const latestRow        = readings[0]                       ?? null;
    const oldestRow        = readings[readings.length - 1]     ?? null;
    const latestValue      = latestRow ? parseFloat(latestRow[axis]) : null;
    const latestTimestamp  = latestRow  ? latestRow.timestamp  : null;
    const oldestTimestamp  = oldestRow  ? oldestRow.timestamp  : null;
    const latestInRedline  = latestValue !== null
        ? (latestValue >= positiveLimit || latestValue <= negativeLimit)
        : null;

    return {
        axis,
        maxEver:          parseFloat(maxVal.toFixed(4)),
        minEver:          parseFloat(minVal.toFixed(4)),
        positiveLimit:    parseFloat(positiveLimit.toFixed(4)),
        negativeLimit:    parseFloat(negativeLimit.toFixed(4)),
        thresholdPercent,
        readingsAnalysed: totalReadings,
        windowRequested:  last,
        redlineCount,
        redlinePercent,
        latestTimestamp,
        oldestTimestamp,
        latestValue,
        latestInRedline,
        status: statusLevel(redlinePercent),
    };
}

// ── Route handler ─────────────────────────────────────────────────────────────
redlineRouter.get('/hbot-torque/redline', async (req: Request, res: Response, next: NextFunction) => {

    const axisParam        = req.query.axis      ? req.query.axis.toString()      : '';
    const from             = req.query.from      ? req.query.from.toString()      : '';
    const to               = req.query.to        ? req.query.to.toString()        : '';
    const last             = Math.min(convertDataToInteger(req.query.last, 1000), 1000);
    const thresholdPercent = Math.min(
        Math.max(convertDataToInteger(req.query.threshold, DEFAULT_THRESHOLD_PERCENT), 1),
        100
    );

    // Validate axis param
    if (axisParam !== '' && !(TORQUE_AXES as readonly string[]).includes(axisParam)) {
        res.status(400).json({
            error: `Unknown axis "${axisParam}". Valid options: ${TORQUE_AXES.join(', ')}`
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

    const axesToAnalyse = axisParam !== '' ? [axisParam] : [...TORQUE_AXES];

    console.log(`Redline: axes=${axesToAnalyse}, threshold=${thresholdPercent}%, last=${last}`);

    try {
        const results = await Promise.all(
            axesToAnalyse.map(a => analyseAxis(a, thresholdPercent, from, to, last))
        );

        res.json({
            data: axisParam !== '' ? results[0] : results,
        });

    } catch (err) {
        next(err);
    }
});
