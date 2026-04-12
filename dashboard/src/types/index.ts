export interface Device {
  id: string;
  user_id: string;
  linked_user_id?: string | null;
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

export interface PairingCode {
  id: string;
  owner_user_id: string;
  code: string;
  expires_at: string;
  used_at: string | null;
  used_by_device_id: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  read: boolean;
  deviceName?: string;
}
