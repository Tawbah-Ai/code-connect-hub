import { Device, DeviceRole, DeviceStatus } from '../types';
import { query } from '../db/database';

// In-memory device storage (fast access for WebSocket routing)
const devices: Map<string, Device> = new Map();

export class DeviceRegistry {
  static loadOrUpdate(device: Device): void {
    devices.set(device.deviceId, device);
  }

  static registerDevice(device: Device): void {
    devices.set(device.deviceId, device);
    console.log(`[DeviceRegistry] Device registered: ${device.deviceId} (${device.role})`);
  }

  static getDevice(deviceId: string): Device | undefined {
    return devices.get(deviceId);
  }

  static getUserDevices(userId: string): Device[] {
    return Array.from(devices.values()).filter((d) => d.userId === userId);
  }

  static getUserDeviceCount(userId: string): number {
    return Array.from(devices.values()).filter((d) => d.userId === userId).length;
  }

  static setDeviceOnline(deviceId: string): void {
    const device = devices.get(deviceId);
    if (device) {
      device.status = DeviceStatus.ONLINE;
      device.lastHeartbeat = Date.now();
      devices.set(deviceId, device);
    }
    query(
      `UPDATE devices SET status = 'ONLINE', last_heartbeat = $1 WHERE device_id = $2`,
      [Date.now(), deviceId]
    ).catch(() => {});
  }

  static setDeviceOffline(deviceId: string): void {
    const device = devices.get(deviceId);
    if (device) {
      device.status = DeviceStatus.OFFLINE;
      devices.set(deviceId, device);
    }
    query(
      `UPDATE devices SET status = 'OFFLINE' WHERE device_id = $1`,
      [deviceId]
    ).catch(() => {});
  }

  static updateHeartbeat(deviceId: string, batteryLevel?: number, isScreenOn?: boolean, isUserActive?: boolean): void {
    const device = devices.get(deviceId);
    if (device) {
      device.lastHeartbeat = Date.now();
      device.status = DeviceStatus.ONLINE;
      devices.set(deviceId, device);
    }
    query(
      `UPDATE devices SET status = 'ONLINE', last_heartbeat = $1 WHERE device_id = $2`,
      [Date.now(), deviceId]
    ).catch(() => {});
  }

  static async loadDevicesFromDB(userId: string): Promise<void> {
    try {
      const result = await query('SELECT * FROM devices WHERE user_id = $1', [userId]);
      for (const row of result.rows) {
        if (!devices.has(row.device_id)) {
          devices.set(row.device_id, {
            deviceId: row.device_id,
            userId: row.user_id,
            deviceName: row.device_name,
            model: row.model,
            osVersion: row.os_version,
            sdkVersion: row.sdk_version,
            manufacturer: row.manufacturer,
            role: row.role,
            status: DeviceStatus.OFFLINE,
            lastHeartbeat: Number(row.last_heartbeat),
            registeredAt: new Date(row.registered_at),
          });
        }
      }
    } catch (e) {
      // non-fatal
    }
  }

  static getOwnerDevice(userId: string): Device | undefined {
    return Array.from(devices.values()).find(
      (d) => d.userId === userId && d.role === DeviceRole.OWNER
    );
  }

  static getClientDevices(userId: string): Device[] {
    return Array.from(devices.values()).filter(
      (d) => d.userId === userId && d.role === DeviceRole.CLIENT
    );
  }

  static getAllDevices(): Device[] {
    return Array.from(devices.values());
  }

  static removeDevice(deviceId: string): void {
    devices.delete(deviceId);
  }

  static checkOfflineDevices(): void {
    const timeout = 60_000; // 60 seconds
    const now = Date.now();

    for (const device of devices.values()) {
      if (device.status === DeviceStatus.ONLINE && now - device.lastHeartbeat > timeout) {
        device.status = DeviceStatus.OFFLINE;
        devices.set(device.deviceId, device);
        console.log(`[DeviceRegistry] Device went offline: ${device.deviceId}`);
      }
    }
  }
}
