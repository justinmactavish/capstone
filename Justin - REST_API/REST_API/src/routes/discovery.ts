/*
 * routes/discovery.ts
 *
 * Discovery endpoints — lets consumers find out what sensors and data columns
 * are available without reading documentation.
 *
 *   GET /sensors              — list available sensor keys and their tables
 *   GET /:sensor/columns      — list data columns for a sensor
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { VALID_TABLES, TABLE_COLUMNS } from '../constants.js';

export const discoveryRouter = express.Router();

// GET /sensors
// Returns every queryable sensor key, its table name, and its data columns.
discoveryRouter.get('/sensors', (_req: Request, res: Response) => {
    const sensors = Object.entries(VALID_TABLES).map(([key, table]) => ({
        sensor:  key,
        table,
        columns: TABLE_COLUMNS[key],
    }));
    res.json({ data: { sensors } });
});

// GET /:sensor/columns
// Returns the data columns available for the given sensor table.
discoveryRouter.get('/:sensor/columns', (req: Request, res: Response, next: NextFunction) => {
    const sensorKey = String(req.params.sensor).toLowerCase();
    const tableName = VALID_TABLES[sensorKey];
    const cols      = TABLE_COLUMNS[sensorKey];

    if (!tableName) {
        res.status(400).json({
            error: `Unknown sensor "${req.params.sensor}". Valid options: ${Object.keys(VALID_TABLES).join(', ')}`
        });
        return;
    }

    res.json({
        data: {
            sensor:  sensorKey,
            table:   tableName,
            columns: cols,
        }
    });
});
