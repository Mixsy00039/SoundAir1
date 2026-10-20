import mysql from 'mysql2/promise';

export interface DbSensorRow {
  id: number;
  node_id: string;
  mic_db: number | null;
  nh3_ppm: number | null;
  co_ppm: number | null;
  no2_ppm: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  seq: number | null;
  rssi: number | null;
  snr: number | null;
  packet: number | null;
  gateway: string | null;
  recorded_at: string;
}

const DB_HOST = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.DB_PASS || process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || '';
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || process.env.MYSQL_DB || 'gas_sound_db';
const DB_TABLE = process.env.DB_TABLE || process.env.MYSQL_TABLE || 'sensor_gas_sound';
const CREATE_DATABASE_IF_MISSING = process.env.NODE_ENV !== 'production';

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid MySQL identifier: ${identifier}`);
  }
  return `\`${identifier}\``;
}


/** Current wall-clock time in Asia/Bangkok as "YYYY-MM-DD HH:mm:ss" */
export function bangkokNowString(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ').slice(0, 19);
}

/** Format any Date / string as Bangkok wall-clock "YYYY-MM-DD HH:mm:ss" */
export function toBangkokString(input: Date | string | null | undefined): string {
  if (!input) return bangkokNowString();
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else {
    const s = String(input).trim();
    if (!s) return bangkokNowString();
    if (s.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
      d = new Date(s);
    } else {
      // MySQL DATETIME without zone → treat as already Bangkok wall time
      return s.length >= 19 ? s.slice(0, 19) : s;
    }
  }
  if (Number.isNaN(d.getTime())) return bangkokNowString();
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ').slice(0, 19);
}

function parseBangkokTimestamp(value: string): number {
  const normalized = value.trim().replace(' ', 'T');
  const timestamp = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}+07:00`;
  return Date.parse(timestamp);
}

let pool: mysql.Pool | null = null;
let isConnected = false;
let connectionError: string | null = null;

// In-Memory Database fallback for storage when MySQL server is unreachable
let memoryRows: DbSensorRow[] = [];
let nextId = 1;

async function ensureGasColumns(conn: mysql.PoolConnection) {
  const columns = [
    ['mic_db', 'FLOAT NULL'],
    ['nh3_ppm', 'FLOAT NULL'],
    ['co_ppm', 'FLOAT NULL'],
    ['no2_ppm', 'FLOAT NULL']
  ];
  for (const [name, definition] of columns) {
    const [rows]: any = await conn.query(
      `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [DB_TABLE, name]
    );
    if (Number(rows[0]?.count) === 0) {
      await conn.query(`ALTER TABLE \`${DB_TABLE}\` ADD COLUMN \`${name}\` ${definition}`);
    }
  }
}

async function ensureDatabaseExists() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    connectTimeout: 5000
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();
}

function createPool() {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 5000
  });
}

// No fake historical data seeded - only store and display real incoming data
export async function initDatabase() {
  try {
    if (CREATE_DATABASE_IF_MISSING) await ensureDatabaseExists();
    pool = createPool();

    const conn = await pool.getConnection();
    console.log(`✅ [MySQL] Connected to database "${DB_NAME}" at ${DB_HOST}:${DB_PORT}`);
    isConnected = true;
    connectionError = null;

    // Ensure table exists if connected to real MySQL
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(DB_TABLE)} (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`node_id\` VARCHAR(50) NOT NULL,
        \`mic_db\` FLOAT NULL,
        \`nh3_ppm\` FLOAT NULL,
        \`co_ppm\` FLOAT NULL,
        \`no2_ppm\` FLOAT NULL,
        \`gps_lat\` DOUBLE NULL,
        \`gps_lon\` DOUBLE NULL,
        \`seq\` INT NULL,
        \`rssi\` INT NULL,
        \`snr\` FLOAT NULL,
        \`packet\` INT NULL,
        \`gateway\` VARCHAR(100) NULL,
        \`recorded_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_node_time (node_id, recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await ensureGasColumns(conn);

    conn.release();
  } catch (err: any) {
    isConnected = false;
    connectionError = err.message;
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ [MySQL] Production startup requires a working database: ${err.message}`);
      throw err;
    }
    console.warn(`⚠️ [MySQL] ไม่สามารถเชื่อมต่อ MySQL ได้ (${err.message}). ระบบใช้ In-Memory Database ชั่วคราว (ข้อมูลจริงจาก MQTT ยังทำงานปกติ)`);
  }
}

export function getDbStatus() {
  return {
    isConnected,
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    table: DB_TABLE,
    user: DB_USER,
    error: connectionError,
    totalRecords: isConnected ? null : memoryRows.length,
    isMemoryEngine: !isConnected
  };
}

export async function ensureDbConnected(): Promise<boolean> {
  if (isConnected && pool) {
    try {
      const conn = await pool.getConnection();
      conn.release();
      return true;
    } catch {
      isConnected = false;
    }
  }
  try {
    if (pool) {
      try { await pool.end(); } catch { /* ignore */ }
      pool = null;
    }
    if (CREATE_DATABASE_IF_MISSING) await ensureDatabaseExists();
    pool = createPool();
    const conn = await pool.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdentifier(DB_TABLE)} (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`node_id\` VARCHAR(50) NOT NULL,
        \`mic_db\` FLOAT NULL,
        \`nh3_ppm\` FLOAT NULL,
        \`co_ppm\` FLOAT NULL,
        \`no2_ppm\` FLOAT NULL,
        \`gps_lat\` DOUBLE NULL,
        \`gps_lon\` DOUBLE NULL,
        \`seq\` INT NULL,
        \`rssi\` INT NULL,
        \`snr\` FLOAT NULL,
        \`packet\` INT NULL,
        \`gateway\` VARCHAR(100) NULL,
        \`recorded_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_node_time (node_id, recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await ensureGasColumns(conn);
    conn.release();
    isConnected = true;
    connectionError = null;
    console.log(`✅ [MySQL] Reconnected to "${DB_NAME}" at ${DB_HOST}:${DB_PORT}`);
    return true;
  } catch (err: any) {
    isConnected = false;
    connectionError = err.message;
    console.warn(`⚠️ [MySQL] Reconnect failed: ${err.message}`);
    return false;
  }
}

export async function insertSensorData(data: Record<string, any>): Promise<number> {
  const recordedAt = bangkokNowString();

  // Prefer MySQL — try reconnect once if needed
  if (!isConnected || !pool) {
    await ensureDbConnected();
  }

  if (isConnected && pool) {
    try {
      const sql = `
        INSERT INTO \`${DB_TABLE}\`
        (node_id, mic_db, nh3_ppm, co_ppm, no2_ppm, gps_lat, gps_lon, seq, rssi, snr, packet, gateway, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const recordedAtBkk = bangkokNowString();
      const values = [
        data.node_id ?? null,
        data.mic_db ?? null,
        data.nh3_ppm ?? null,
        data.co_ppm ?? null,
        data.no2_ppm ?? null,
        data.gps_lat ?? null,
        data.gps_lon ?? null,
        data.seq ?? null,
        data.rssi ?? null,
        data.snr ?? null,
        data.packet_loss ?? data.packet ?? null,
        data.gateway ?? null,
        recordedAtBkk
      ];
      const [result]: any = await pool.execute(sql, values);
      const insertId = result.insertId as number;
      console.log(`💾 [MySQL] Saved node=${data.node_id} id=${insertId} mic=${data.mic_db}`);
      return insertId;
    } catch (err: any) {
      console.error('MySQL Insert Error:', err.message);
      // one reconnect + retry
      const ok = await ensureDbConnected();
      if (ok && pool) {
        try {
          const sql = `
            INSERT INTO \`${DB_TABLE}\`
            (node_id, mic_db, nh3_ppm, co_ppm, no2_ppm, gps_lat, gps_lon, seq, rssi, snr, packet, gateway, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const values = [
            data.node_id ?? null,
            data.mic_db ?? null,
            data.nh3_ppm ?? null,
            data.co_ppm ?? null,
            data.no2_ppm ?? null,
            data.gps_lat ?? null,
            data.gps_lon ?? null,
            data.seq ?? null,
            data.rssi ?? null,
            data.snr ?? null,
            data.packet_loss ?? data.packet ?? null,
            data.gateway ?? null,
            bangkokNowString()
          ];
          const [result]: any = await pool.execute(sql, values);
          console.log(`💾 [MySQL] Saved (retry) node=${data.node_id} id=${result.insertId}`);
          return result.insertId;
        } catch (err2: any) {
          console.error('MySQL Insert Retry Error:', err2.message);
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MySQL is unavailable; refusing to store telemetry in memory in production');
  }

  // Fallback to Memory only if MySQL truly unavailable
  const newRow: DbSensorRow = {
    id: nextId++,
    node_id: String(data.node_id || '01'),
    mic_db: data.mic_db ?? null,
    nh3_ppm: data.nh3_ppm ?? null,
    co_ppm: data.co_ppm ?? null,
    no2_ppm: data.no2_ppm ?? null,
    gps_lat: data.gps_lat ?? null,
    gps_lon: data.gps_lon ?? null,
    seq: data.seq ?? null,
    rssi: data.rssi ?? null,
    snr: data.snr ?? null,
    packet: data.packet_loss ?? data.packet ?? null,
    gateway: data.gateway ?? 'gw-01',
    recorded_at: recordedAt
  };
  memoryRows.push(newRow);
  if (memoryRows.length > 5000) {
    memoryRows.shift();
  }
  console.warn(`⚠️ [Memory] MySQL unavailable — stored node=${newRow.node_id} in memory only (id=${newRow.id})`);
  return newRow.id;
}

export function normalizeDbRow(row: any): DbSensorRow {
  const mic = row.mic_db !== null && row.mic_db !== undefined ? Number(row.mic_db) : null;
  const nh3 = row.nh3_ppm !== null && row.nh3_ppm !== undefined ? Number(row.nh3_ppm) : null;
  const co = row.co_ppm !== null && row.co_ppm !== undefined ? Number(row.co_ppm) : null;
  const no2 = row.no2_ppm !== null && row.no2_ppm !== undefined ? Number(row.no2_ppm) : null;

  return {
    id: row.id,
    node_id: String(row.node_id),
    mic_db: mic !== null && mic >= 0 ? mic : null,
    nh3_ppm: nh3 !== null && nh3 >= 0 ? nh3 : null,
    co_ppm: co !== null && co >= 0 ? co : null,
    no2_ppm: no2 !== null && no2 >= 0 ? no2 : null,
    gps_lat: row.gps_lat !== null && row.gps_lat !== undefined ? Number(row.gps_lat) : null,
    gps_lon: row.gps_lon !== null && row.gps_lon !== undefined ? Number(row.gps_lon) : null,
    seq: row.seq !== null && row.seq !== undefined ? Number(row.seq) : null,
    rssi: row.rssi !== null && row.rssi !== undefined ? Number(row.rssi) : null,
    snr: row.snr !== null && row.snr !== undefined ? Number(row.snr) : null,
    packet: row.packet !== null && row.packet !== undefined ? Number(row.packet) : null,
    gateway: row.gateway ?? null,
    recorded_at: toBangkokString(row.recorded_at)
  };
}

export function deduplicateRows(rows: DbSensorRow[]): DbSensorRow[] {
  const result: DbSensorRow[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    // Deduplicate by node_id and sequence if available, or by node_id and recorded timestamp
    const key = r.seq !== null && r.seq !== undefined
      ? `${r.node_id}-seq-${r.seq}`
      : `${r.node_id}-time-${r.recorded_at}`;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    } else {
      // If previous entry was missing RSSI/gateway, upgrade it if this duplicate has richer data
      const idx = result.findIndex(existing =>
        (r.seq !== null && existing.seq === r.seq && existing.node_id === r.node_id) ||
        (existing.node_id === r.node_id && existing.recorded_at === r.recorded_at)
      );
      if (idx !== -1 && (result[idx].rssi === null && r.rssi !== null)) {
        result[idx] = r;
      }
    }
  }

  return result;
}

export async function getDistinctNodes(): Promise<string[]> {
  if (isConnected && pool) {
    try {
      const [rows]: any = await pool.query(
        `SELECT DISTINCT node_id FROM \`${DB_TABLE}\` ORDER BY node_id ASC`
      );
      return rows.map((r: any) => String(r.node_id));
    } catch (err) {
      console.error('getDistinctNodes error:', err);
    }
  }

  const nodes = [...new Set(memoryRows.map(r => String(r.node_id)))];
  return nodes.sort();
}

export async function getLatestPerNode(): Promise<DbSensorRow[]> {
  if (isConnected && pool) {
    try {
      const [rows]: any = await pool.query(
        `SELECT s.* FROM \`${DB_TABLE}\` s
         INNER JOIN (
           SELECT node_id, MAX(id) AS max_id FROM \`${DB_TABLE}\` GROUP BY node_id
         ) latest ON s.node_id = latest.node_id AND s.id = latest.max_id`
      );
      return rows.map(normalizeDbRow);
    } catch (err) {
      console.error('getLatestPerNode error:', err);
    }
  }

  const map = new Map<string, DbSensorRow>();
  for (const row of memoryRows) {
    map.set(String(row.node_id), normalizeDbRow(row));
  }
  return [...map.values()].sort((a, b) => String(a.node_id).localeCompare(String(b.node_id)));
}

export async function getNodeHistory(nodeId: string, limit = 100, sinceHours = 24, startDate?: string, endDate?: string): Promise<DbSensorRow[]> {
  const safeLimit = Math.min(Math.max(limit, 50), 5000);
  const safeHours = Math.max(0.25, sinceHours);

  if (isConnected && pool) {
    try {
      const table = DB_TABLE;
      // Use MySQL NOW() so filter matches how recorded_at was written (same clock)
      const start = startDate || (() => {
          const d = new Date(Date.now() - safeHours * 3600 * 1000);
          return d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' }).replace('T', ' ').slice(0, 19);
        })();
      const dateClause = endDate ? ' AND recorded_at <= ?' : '';
      const [rows]: any = await pool.query(
        'SELECT id, node_id, mic_db, nh3_ppm, co_ppm, no2_ppm, gps_lat, gps_lon, seq, rssi, snr, packet, gateway, recorded_at FROM `' + table + '` WHERE node_id = ? AND recorded_at >= ?' + dateClause + ' ORDER BY recorded_at ASC, id ASC LIMIT ?',
        endDate ? [nodeId, start, endDate, safeLimit] : [nodeId, start, safeLimit]
      );
      let normalized = deduplicateRows(rows.map(normalizeDbRow));

      // Fallback: if time window empty, return latest points (still real data)
      if (normalized.length === 0 && !startDate && !endDate) {
        const [fallback]: any = await pool.query(
          'SELECT id, node_id, mic_db, nh3_ppm, co_ppm, no2_ppm, gps_lat, gps_lon, seq, rssi, snr, packet, gateway, recorded_at FROM `' + table + '` WHERE node_id = ? ORDER BY id DESC LIMIT ?',
          [nodeId, Math.min(safeLimit, 500)]
        );
        normalized = deduplicateRows(fallback.map(normalizeDbRow)).reverse();
        console.warn(`[DB] node ${nodeId}: no rows in last ${safeHours}h — fallback latest ${normalized.length} rows`);
      }
      return normalized;
    } catch (err) {
      console.error('getNodeHistory error:', err);
    }
  }

  const sinceMs = startDate ? parseBangkokTimestamp(startDate) : Date.now() - safeHours * 3600 * 1000;
  const endMs = endDate ? parseBangkokTimestamp(endDate) : Number.POSITIVE_INFINITY;
  const allForNode = memoryRows
    .filter(r => String(r.node_id) === String(nodeId))
    .map(normalizeDbRow);
  let filtered = allForNode.filter(r => {
    const t = parseBangkokTimestamp(String(r.recorded_at));
    return !Number.isNaN(t) && t >= sinceMs && t <= endMs;
  });
  if (filtered.length === 0 && !startDate && !endDate) {
    filtered = allForNode.slice(-Math.min(safeLimit, 500));
  }
  return deduplicateRows(filtered).slice(-safeLimit);
}

export async function getAllNodesHistory(limit = 100): Promise<DbSensorRow[]> {
  if (isConnected && pool) {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, node_id, mic_db, nh3_ppm, co_ppm, no2_ppm, gps_lat, gps_lon, seq, rssi, snr, packet, gateway, recorded_at
         FROM \`${DB_TABLE}\`
         ORDER BY id DESC
         LIMIT ?`,
        [Math.min(limit * 8, 4000)]
      );
      const normalized = rows.map(normalizeDbRow);
      return deduplicateRows(normalized).slice(0, limit * 4).reverse();
    } catch (err) {
      console.error('getAllNodesHistory error:', err);
    }
  }

  return deduplicateRows(memoryRows.slice().reverse().map(normalizeDbRow)).slice(0, limit * 4).reverse();
}

export async function getSensorRows(options: {
  nodeId?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<{ rows: DbSensorRow[]; total: number }> {
  const limit = Math.min(options.limit || 100, 1000);

  if (isConnected && pool) {
    try {
      let sql = `SELECT * FROM \`${DB_TABLE}\``;
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.nodeId) {
        conditions.push('node_id = ?');
        params.push(options.nodeId);
      }
      if (options.startDate) {
        conditions.push('recorded_at >= ?');
        params.push(options.startDate);
      }
      if (options.endDate) {
        conditions.push('recorded_at <= ?');
        params.push(options.endDate);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY id DESC LIMIT ?';
      params.push(limit);

      const [rows]: any = await pool.query(sql, params);
      return { rows: rows.map(normalizeDbRow), total: rows.length };
    } catch (err) {
      console.error('getSensorRows error:', err);
    }
  }

  let filtered = memoryRows.map(normalizeDbRow);
  if (options.nodeId) {
    filtered = filtered.filter(r => String(r.node_id) === String(options.nodeId));
  }
  if (options.startDate) {
    filtered = filtered.filter(r => r.recorded_at >= options.startDate!);
  }
  if (options.endDate) {
    filtered = filtered.filter(r => r.recorded_at <= options.endDate!);
  }

  filtered.sort((a, b) => b.id - a.id);
  return {
    rows: filtered.slice(0, limit),
    total: filtered.length
  };
}
