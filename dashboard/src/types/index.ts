export interface Device {
  id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  model: string;
  os_version: string;
  manufacturer: string;
  role: 'OWNER' | 'CLIENT';
  status: 'ONLINE' | 'OFFLINE';
  last_seen: string;
  created_at: string;
}

export interface Command {
  id: string;
  device_id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'EXECUTED' | 'FAILED';
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type ControlMode = 'COMMAND' | 'TOUCH' | 'HYBRID';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'command' | 'result' | 'error' | 'info';
  message: string;
  data?: unknown;
}
