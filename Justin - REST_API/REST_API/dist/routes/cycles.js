/*
 * routes/cycles.ts
 *
 * GET /robot1/position/cycles
 *
 * Derives a part cycle count by analysing the robot's Y-axis position history.
 * Uses a state machine over paired X/Y readings to detect each time the robot
 * completes a pick-and-place cycle.
 *
 * State machine zones:
 *   CONVEYOR  — |Y| <= pickRadius       (robot at conveyor pick position, Y≈0)
 *   BIN1      — Y  >  +BIN_THRESHOLD    (positive Y extreme — first drop bin)
 *   BIN2      — Y  < -BIN_THRESHOLD     (negative Y extreme — second drop bin)
 *   TRANSIT   — everything else
 *
 * Bin threshold is hardcoded at ±525 mm based on the physical machine layout.
 * It can be overridden for testing via ?bin-threshold=N.
 *
 * A part is counted each time the robot enters a bin zone, provided it has
 * previously visited the conveyor zone (prevents false counts at data start).
 *
 * Query parameters (all optional):
 *   last           — readings to analyse per axis (default 1000, max 5000)
 *   from           — timestamp lower bound
 *   to             — timestamp upper bound
 *   pick-radius    — Y distance from 0 that counts as "at conveyor" mm (default 15)
 *   bin-threshold  — Y distance from 0 that counts as "in bin" mm (default 525)
 *
 * Response:
 *   { data: { bin1Count, bin2Count, totalCount, analysedReadings, binThresholdUsed } }
 *
 * Examples:
 *   GET /robot1/position/cycles
 *   GET /robot1/position/cycles?from=2026-06-10T08:00:00
 *   GET /robot1/position/cycles?bin-threshold=480&pick-radius=20
 */
import express from 'express';
import { pool } from '../db.js';
import { convertDataToInteger, isValidTimestamp } from '../helpers.js';
export const cyclesRouter = express.Router();
// Hardcoded based on machine physical layout — Y extremes are ±525 mm from centre.
const DEFAULT_BIN_THRESHOLD = 525;
// ── Helpers ───────────────────────────────────────────────────────────────────
function classifyZone(y, pickRadius, binThreshold) {
    if (y > binThreshold)
        return 'bin1';
    if (y < -binThreshold)
        return 'bin2';
    if (Math.abs(y) <= pickRadius)
        return 'conveyor';
    return 'transit';
}
// Pair X readings to nearest Y reading within a 1-second tolerance window.
// Both arrays must be sorted oldest-first.
function pairReadings(xRows, yRows, toleranceMs = 1000) {
    const points = [];
    let yIdx = 0;
    for (const xRow of xRows) {
        const xTime = new Date(xRow.timestamp).getTime();
        // Advance yIdx toward the closest Y timestamp
        while (yIdx < yRows.length - 1) {
            const currDiff = Math.abs(new Date(yRows[yIdx].timestamp).getTime() - xTime);
            const nextDiff = Math.abs(new Date(yRows[yIdx + 1].timestamp).getTime() - xTime);
            if (nextDiff < currDiff)
                yIdx++;
            else
                break;
        }
        const yTime = new Date(yRows[yIdx].timestamp).getTime();
        if (Math.abs(yTime - xTime) <= toleranceMs) {
            points.push({
                x: parseFloat(xRow.value),
                y: parseFloat(yRows[yIdx].value),
            });
        }
    }
    return points;
}
// ── Route handler ─────────────────────────────────────────────────────────────
cyclesRouter.get('/robot1/position/cycles', async (req, res, next) => {
    const last = Math.min(convertDataToInteger(req.query.last, 1000), 5000);
    const pickRadius = convertDataToInteger(req.query['pick-radius'], 15);
    const binThreshold = convertDataToInteger(req.query['bin-threshold'], DEFAULT_BIN_THRESHOLD);
    const from = req.query.from ? req.query.from.toString() : '';
    const to = req.query.to ? req.query.to.toString() : '';
    if (from !== '' && !isValidTimestamp(from)) {
        res.status(400).json({ error: `Invalid 'from' value: "${from}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }
    if (to !== '' && !isValidTimestamp(to)) {
        res.status(400).json({ error: `Invalid 'to' value: "${to}". Use format: YYYY-MM-DDTHH:MM:SS` });
        return;
    }
    // Build a single clean parameterised query.
    // The metric filter is embedded literally because it's a fixed constant,
    // not user input — no injection risk.  Dynamic values (timestamps) are
    // always passed as positional parameters ($1, $2 …).
    const sqlValues = [];
    let whereClause = "metric IN ('ROBOTPOS.X', 'ROBOTPOS.Y')";
    if (from !== '') {
        sqlValues.push(from);
        whereClause += ` AND timestamp > $${sqlValues.length}`;
    }
    if (to !== '') {
        sqlValues.push(to);
        whereClause += ` AND timestamp < $${sqlValues.length}`;
    }
    const sql = `SELECT timestamp, metric, value FROM public."robot1_position"` +
        ` WHERE ${whereClause}` +
        ` ORDER BY timestamp DESC LIMIT ${last * 2}`;
    console.log("Cycles SQL:", sql, "| values:", sqlValues);
    try {
        const result = await pool.query(sql, sqlValues);
        // Reverse to get oldest-first for the state machine
        const allRows = result.rows.reverse();
        const xRows = allRows.filter((r) => r.metric === 'ROBOTPOS.X');
        const yRows = allRows.filter((r) => r.metric === 'ROBOTPOS.Y');
        if (xRows.length === 0 || yRows.length === 0) {
            res.json({
                data: {
                    bin1Count: 0, bin2Count: 0, totalCount: 0,
                    analysedReadings: 0,
                    message: 'Insufficient position data',
                }
            });
            return;
        }
        // Pair X and Y readings by nearest timestamp (within 1 second)
        const points = pairReadings(xRows, yRows);
        if (points.length === 0) {
            res.json({
                data: {
                    bin1Count: 0, bin2Count: 0, totalCount: 0,
                    analysedReadings: allRows.length,
                    message: 'Could not pair X/Y readings — timestamps may be too far apart',
                }
            });
            return;
        }
        // ── State machine ──────────────────────────────────────────────────────
        // Count transitions INTO a bin zone, but only after first visiting the
        // conveyor zone — prevents spurious counts if the data window starts
        // while the robot is already inside a bin.
        let bin1Count = 0;
        let bin2Count = 0;
        let lastZone = 'transit';
        let seenConveyor = false;
        for (const pt of points) {
            const zone = classifyZone(pt.y, pickRadius, binThreshold);
            if (zone === 'conveyor')
                seenConveyor = true;
            if (seenConveyor) {
                if (zone === 'bin1' && lastZone !== 'bin1')
                    bin1Count++;
                if (zone === 'bin2' && lastZone !== 'bin2')
                    bin2Count++;
            }
            lastZone = zone;
        }
        res.json({
            data: {
                bin1Count,
                bin2Count,
                totalCount: bin1Count + bin2Count,
                analysedReadings: points.length,
                binThresholdUsed: binThreshold,
            }
        });
    }
    catch (err) {
        next(err);
    }
});
//# sourceMappingURL=cycles.js.map