import { supabase } from '../lib/supabase';
import type { Device, Command, PairingCode } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

class SupabaseService {
  private deviceChannel: RealtimeChannel | null = null;
  private commandChannel: RealtimeChannel | null = null;
  private screenChannel: RealtimeChannel | null = null;

  // ─── Auth ───────────────────────────────────────────

  async register(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration failed');

    // Register dashboard as a device
    await this.registerDashboardDevice(data.user.id);
    return data;
  }

  async login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  }

  async logout() {
    this.unsubscribeAll();
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  async getUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
  }

  // ─── Device Registration ───────────────────────────

  private async registerDashboardDevice(userId: string) {
    // Check if user already has devices → determines OWNER or CLIENT
    const { data: existingDevices } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId);

    const role = (!existingDevices || existingDevices.length === 0) ? 'OWNER' : 'CLIENT';

    const { error } = await supabase.from('devices').upsert({
      user_id: userId,
      device_id: `dashboard-${userId.substring(0, 8)}`,
      device_name: 'Web Dashboard',
      model: 'Browser',
      os_version: navigator.userAgent.substring(0, 50),
      manufacturer: 'Web',
      role,
      status: 'ONLINE',
      last_seen: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });

    if (error) console.error('Failed to register dashboard device:', error);
  }

  // ─── Devices ───────────────────────────────────────

  async getDevices(): Promise<Device[]> {
    const user = await this.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data || []) as Device[];
  }

  async updateDeviceStatus(deviceId: string, status: 'ONLINE' | 'OFFLINE') {
    const { error } = await supabase
      .from('devices')
      .update({ status, last_seen: new Date().toISOString() })
      .eq('id', deviceId);

    if (error) throw new Error(error.message);
  }

  async removeDevice(deviceId: string) {
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', deviceId);

    if (error) throw new Error(error.message);
  }

  async createPairingCode(): Promise<PairingCode> {
    const user = await this.getUser();
    if (!user) throw new Error('Not authenticated');

    await supabase
      .from('device_pairing_codes')
      .delete()
      .eq('owner_user_id', user.id)
      .is('used_at', null);

    let code: string | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      const { data: existing } = await supabase
        .from('device_pairing_codes')
        .select('id')
        .eq('code', candidate)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (!existing) { code = candidate; break; }
    }
    if (!code) throw new Error('Could not generate a unique pairing code, try again');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('device_pairing_codes')
      .insert({ owner_user_id: user.id, code, expires_at: expiresAt })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as PairingCode;
  }

  // ─── Commands ──────────────────────────────────────

  async sendCommand(
    deviceId: string,
    type: string,
    payload: Record<string, unknown> = {}
  ): Promise<Command> {
    const user = await this.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('commands')
      .insert({
        device_id: deviceId,
        user_id: user.id,
        type,
        payload,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Command;
  }

  async getCommandHistory(deviceId: string, limit = 20): Promise<Command[]> {
    const { data, error } = await supabase
      .from('commands')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data || []) as Command[];
  }

  // ─── Realtime Subscriptions ────────────────────────

  subscribeToDevices(
    userId: string,
    onChange: (devices: Device[]) => void
  ) {
    this.deviceChannel = supabase
      .channel('devices-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Re-fetch all devices on any change
          const devices = await this.getDevices();
          onChange(devices);
        }
      )
      .subscribe();
  }

  subscribeToCommands(
    userId: string,
    onCommand: (command: Command) => void
  ) {
    this.commandChannel = supabase
      .channel('commands-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'commands',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onCommand(payload.new as Command);
        }
      )
      .subscribe();
  }

  // ─── Screen Streaming ─────────────────────────────

  subscribeToScreenStream(
    deviceId: string,
    onFrame: (frameData: string) => void
  ) {
    this.screenChannel = supabase
      .channel(`screen-${deviceId}`)
      .on('broadcast', { event: 'screen-frame' }, (payload) => {
        if (payload.payload && typeof payload.payload.frame === 'string') {
          onFrame(payload.payload.frame);
        }
      })
      .subscribe();
  }

  unsubscribeFromScreenStream() {
    if (this.screenChannel) {
      supabase.removeChannel(this.screenChannel);
      this.screenChannel = null;
    }
  }

  unsubscribeAll() {
    if (this.deviceChannel) {
      supabase.removeChannel(this.deviceChannel);
      this.deviceChannel = null;
    }
    if (this.commandChannel) {
      supabase.removeChannel(this.commandChannel);
      this.commandChannel = null;
    }
    this.unsubscribeFromScreenStream();
  }

  // ─── Logs ──────────────────────────────────────────

  async getLogs(deviceId: string, limit = 50) {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data || [];
  }

  async addLog(
    deviceId: string | null,
    message: string,
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' = 'INFO'
  ) {
    const user = await this.getUser();
    if (!user) return;

    await supabase.from('logs').insert({
      device_id: deviceId,
      user_id: user.id,
      message,
      level,
    });
  }
}

export const api = new SupabaseService();
