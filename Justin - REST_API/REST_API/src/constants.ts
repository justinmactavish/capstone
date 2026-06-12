/*
 * constants.ts
 *
 * Shared constants used across routes.
 *
 * The Hbot database uses a wide-table (columnar) schema — each row contains
 * all sensor values for a given timestamp.  There is no EAV metric/value
 * pattern; instead, specific column names are selected per table.
 *
 * Tables:
 *   Hbot_Position  — x_pos, y_pos, z_pos
 *   Hbot_Status    — initialized, running, ws_violation, speed_pct
 *   Hbot_Torque    — x_torque, y_torque, z_torque
 *   Cell_Status    — initialized, running, speed_pct, finished_part_num, safety_enable, paused
 */

// Maps URL-friendly sensor keys to actual PostgreSQL table names (case-sensitive, quoted in queries)
export const VALID_TABLES: Record<string, string> = {
    'hbot-position': 'Hbot_Position',
    'hbot-status':   'Hbot_Status',
    'hbot-torque':   'Hbot_Torque',
    'cell-status':   'Cell_Status',
};

// Maps each sensor key to its data columns (excludes id and timestamp)
export const TABLE_COLUMNS: Record<string, readonly string[]> = {
    'hbot-position': ['x_pos', 'y_pos', 'z_pos'],
    'hbot-status':   ['initialized', 'running', 'ws_violation', 'speed_pct'],
    'hbot-torque':   ['x_torque', 'y_torque', 'z_torque'],
    'cell-status':   ['initialized', 'running', 'speed_pct', 'finished_part_num', 'safety_enable', 'paused'],
};

// Torque axes used by the redline analyser
export const TORQUE_AXES = ['x_torque', 'y_torque', 'z_torque'] as const;

export const VALID_AGG_FUNCTIONS = ['avg', 'min', 'max', 'count', 'sum'] as const;

// Hard cap on rows returned per request
export const MAX_LIMIT = 10000;