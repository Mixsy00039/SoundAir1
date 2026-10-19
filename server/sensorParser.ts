// Sensor Parser Utility for gas/sound nodes received through LoRa or WiFi.

export const RAW_FIELD_MAP: Record<string, string> = {
  NODE: 'node_id',
  MIC: 'mic_db',
  NH3: 'nh3_ppm',
  CO: 'co_ppm',
  NO2: 'no2_ppm',
  LAT: 'gps_lat',
  LON: 'gps_lon',
  SEQ: 'seq',
  RSSI: 'rssi',
  SNR: 'snr',
  LOSS: 'packet_loss',
  PACKET: 'packet_loss',
  GW: 'gateway',
};

export function parseRawKeyValue(raw: string): Record<string, any> {
  const data: Record<string, any> = {};
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    const field = RAW_FIELD_MAP[key];
    if (!field) continue;
    
    // node_id and gateway are strings, others are numeric.
    if (field === 'node_id' || field === 'gateway') {
      data[field] = value;
    } else {
      const num = Number(value);
      if (isNaN(num) || (num < 0 && !['rssi'].includes(field))) {
        data[field] = null;
      } else {
        data[field] = num;
      }
    }
  }
  return data;
}

export function parseSensorMessage(raw: string): Record<string, any> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const numeric = (value: unknown, negativeAsNull = true): number | null => {
        if (value === undefined || value === null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && (!negativeAsNull || number >= 0) ? number : null;
      };

      // Normalize the JSON payload emitted by both the WiFi node and LoRa gateway.
      return {
        node_id: parsed.node_id ?? parsed.node ?? parsed.NODE,
        mic_db: numeric(parsed.mic_db ?? parsed.mic ?? parsed.MIC),
        nh3_ppm: numeric(parsed.nh3_ppm ?? parsed.nh3 ?? parsed.NH3),
        co_ppm: numeric(parsed.co_ppm ?? parsed.co ?? parsed.CO),
        no2_ppm: numeric(parsed.no2_ppm ?? parsed.no2 ?? parsed.NO2),
        gps_lat: numeric(parsed.gps_lat ?? parsed.LAT ?? parsed.lat, false),
        gps_lon: numeric(parsed.gps_lon ?? parsed.LON ?? parsed.lon, false),
        seq: numeric(parsed.seq ?? parsed.SEQ),
        rssi: numeric(parsed.rssi ?? parsed.RSSI, false),
        snr: numeric(parsed.snr ?? parsed.SNR, false),
        packet: numeric(parsed.packet ?? parsed.PACKET),
        gateway: parsed.gateway ?? parsed.GW ?? parsed.gw,
      };
    } catch {
      // fallback to key-value
    }
  }
  return parseRawKeyValue(trimmed);
}

export function extractNodeIdFromTopic(topic: string): string | null {
  const parts = topic.split('/');
  // Legacy topic forms may still carry the node id in the topic.
  if (parts.length >= 3 && parts[0] === 'flood' && parts[1] !== 'status') {
    const id = parts[1];
    // ignore non-numeric placeholder segments
    if (id && id !== 'data' && id !== 'raw' && id !== 'status') return id;
  }
  // flood/status/<node_id>
  if (parts.length >= 3 && parts[0] === 'flood' && parts[1] === 'status') {
    return parts[2] || null;
  }
  // sensors/data/<transport>/<node_id> (node id is normally in the payload)
  if (parts.length >= 4 && parts[0] === 'sensors' && parts[1] === 'data' && parts[3] !== 'raw') {
    return parts[3] || null;
  }
  return null;
}
