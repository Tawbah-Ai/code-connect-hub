import { Device, DeviceRole, DeviceStatus } from '../types';

// In-memory device storage
const devices: Map<string, Device> = new Map();

export class DeviceRegistry {
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
  }

  static setDeviceOffline(deviceId: string): void {
    const device = devices.get(deviceId);
    if (device) {
      device.status = DeviceStatus.OFFLINE;
      devices.set(deviceId, device);
    }
  }

  static updateHeartbeat(deviceId: string, batteryLevel?: number, isScreenOn?: boolean, isUserActive?: boolean): void {
    const device = devices.get(deviceId);
    if (device) {
      device.lastHeartbeat = Date.now();
      device.status = DeviceStatus.ONLINE;
      devices.set(deviceId, device);
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
