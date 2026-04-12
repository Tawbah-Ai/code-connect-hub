export interface Database {
  public: {
    Tables: {
      devices: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          device_name?: string;
          model?: string;
          os_version?: string;
          manufacturer?: string;
          role?: 'OWNER' | 'CLIENT';
          status?: 'ONLINE' | 'OFFLINE';
          last_seen?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          device_id?: string;
          device_name?: string;
          model?: string;
          os_version?: string;
          manufacturer?: string;
          role?: 'OWNER' | 'CLIENT';
          status?: 'ONLINE' | 'OFFLINE';
          last_seen?: string;
          created_at?: string;
        };
      };
      commands: {
        Row: {
          id: string;
          device_id: string;
          user_id: string;
          type: string;
          payload: Record<string, unknown>;
          status: 'PENDING' | 'EXECUTED' | 'FAILED';
          result: Record<string, unknown> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          user_id: string;
          type: string;
          payload?: Record<string, unknown>;
          status?: 'PENDING' | 'EXECUTED' | 'FAILED';
          result?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string;
          user_id?: string;
          type?: string;
          payload?: Record<string, unknown>;
          status?: 'PENDING' | 'EXECUTED' | 'FAILED';
          result?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      logs: {
        Row: {
          id: string;
          device_id: string | null;
          user_id: string | null;
          message: string;
          level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id?: string | null;
          user_id?: string | null;
          message: string;
          level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
          created_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string | null;
          user_id?: string | null;
          message?: string;
          level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
