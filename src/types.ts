export interface SensorData {
  id?: number;
  node_id: string;
  mic_db?: number | null;
  nh3_ppm?: number | null;
  co_ppm?: number | null;
  no2_ppm?: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  seq: number | null;
  rssi: number | null;
  snr: number | null;
  packet: number | null;
  gateway: string | null;
  recorded_at: string;
  source?: 'mqtt' | 'db' | 'simulated';
}

export interface NodeSummary {
  node_id: string;
  name: string;
  location_name: string;
  latest: SensorData | null;
  status: 'normal' | 'watch' | 'danger' | 'offline' | 'error';
  status_th: string;
  mic_db: number | null;
  nh3_ppm: number | null;
  co_ppm: number | null;
  no2_ppm: number | null;
  rssi: number | null;
  snr: number | null;
  packet: number | null;
  gps_lat: number | null;
  gps_lon: number | null;
  last_updated: string;
  warning_threshold_cm: number;
  danger_threshold_cm: number;
  max_capacity_cm: number;
  trend: 'rising' | 'falling' | 'stable';
}

export interface SystemStatus {
  mysql_connected: boolean;
  mysql_host: string;
  mysql_db: string;
  mysql_table: string;
  mysql_error?: string | null;
  mqtt_connected: boolean;
  mqtt_host: string;
  mqtt_topic: string;
  mqtt_error?: string | null;
  total_records: number;
  active_nodes_count: number;
  last_packet_time: string | null;
  is_using_mock_db: boolean;
}

export interface ChartDataPoint {
  timestamp: string;
  timeLabel: string;
  mic_db?: number | null;
  nh3_ppm?: number | null;
  co_ppm?: number | null;
  no2_ppm?: number | null;
  packet?: number | null;
  rssi: number | null;
  node_id: string;
  [key: string]: any;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  role_th: string;
  department: string;
  avatar?: string;
  last_login?: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}
