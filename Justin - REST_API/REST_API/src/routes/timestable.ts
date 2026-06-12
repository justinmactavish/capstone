/*
 * routes/timestable.ts
 *
 * GET /timestable/:table
 *
 * Demo / utility route that generates a multiplication table.
 * Carried over from the original rest02 project as a sanity-check endpoint —
 * useful for confirming the server is alive and routing correctly without
 * needing a database connection.
 *
 * URL segments:
 *   table  — the multiplier (e.g. /timestable/7 for the 7× table)
 *
 * Query parameters (all optional):
 *   start  — first multiplicand  (default: 1)
 *   end    — last  multiplicand  (default: 10)
 *
 * Example:
 *   GET /timestable/7?start=1&end=5
 *   → ["1 x 7 = 7", "2 x 7 = 14", "3 x 7 = 21", "4 x 7 = 28", "5 x 7 = 35"]
 */

import express from 'express';
import type { Request, Response } from 'express';
import { convertDataToInteger } from '../helpers.js';

export const timestableRouter = express.Router();

/**
 * generateTimesTable
 *
 * Builds an array of human-readable multiplication strings for a given
 * multiplier over the range [start, end] (inclusive).
 *
 * @param ttable - The multiplier (e.g. 7 for the 7× table).
 * @param start  - First multiplicand.
 * @param end    - Last  multiplicand.
 * @returns      Array of strings in the form "x × ttable = result".
 */
function generateTimesTable(ttable: number, start: number, end: number): string[] {
    const output: string[] = [];
    for (let x = start; x <= end; x++) {
        output.push(`${x} x ${ttable} = ${x * ttable}`);
    }
    return output;
}

timestableRouter.get('/timestable/:table', (req: Request, res: Response) => {
    const ttable = convertDataToInteger(req.params.table, 1);
    const start  = convertDataToInteger(req.query.start,  1);
    const end    = convertDataToInteger(req.query.end,    10);
    res.json(generateTimesTable(ttable, start, end));
});
