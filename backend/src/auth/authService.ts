import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/database';
import { DeviceRole, DeviceStatus, AuthPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  console.warn('[Auth] JWT_SECRET is not configured; using an ephemeral development secret');
  return crypto.randomBytes(32).toString('hex');
})();
const TOKEN_EXPIRY = '30d';

export class AuthService {
  static async register(
    email: string,
    password: string,
    deviceInfo: {
      deviceId: string;
      deviceName: string;
      model: string;
      osVersion: string;
      sdkVersion: number;
      manufacturer: string;
    }
  ): Promise<{ token: string; userId: string; deviceId: string; role: DeviceRole }> {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) throw new Error('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, passwordHash]
    );
    const userId: string = userResult.rows[0].id;

    const countResult = await query('SELECT COUNT(*) FROM devices WHERE user_id = $1', [userId]);
    const role = parseInt(countResult.rows[0].count) === 0 ? DeviceRole.OWNER : DeviceRole.CLIENT;

    await query(
      `INSERT INTO devices (device_id, user_id, device_name, model, os_version, sdk_version, manufacturer, role, status, last_heartbeat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (device_id) DO UPDATE SET
         user_id = EXCLUDED.user_id, device_name = EXCLUDED.device_name,
         model = EXCLUDED.model, os_version = EXCLUDED.os_version,
         sdk_version = EXCLUDED.sdk_version, manufacturer = EXCLUDED.manufacturer`,
      [deviceInfo.deviceId, userId, deviceInfo.deviceName, deviceInfo.model,
       deviceInfo.osVersion, deviceInfo.sdkVersion, deviceInfo.manufacturer,
       role, DeviceStatus.OFFLINE, Date.now()]
    );

    const { DeviceRegistry } = await import('../websocket/deviceRegistry');
    DeviceRegistry.loadOrUpdate({
      deviceId: deviceInfo.deviceId, userId, deviceName: deviceInfo.deviceName,
      model: deviceInfo.model, osVersion: deviceInfo.osVersion,
      sdkVersion: deviceInfo.sdkVersion, manufacturer: deviceInfo.manufacturer,
      role, status: DeviceStatus.OFFLINE, lastHeartbeat: Date.now(), registeredAt: new Date(),
    });

    const token = AuthService.generateToken({ userId, email, deviceId: deviceInfo.deviceId });
    return { token, userId, deviceId: deviceInfo.deviceId, role };
  }

  static async login(
    email: string,
    password: string,
    deviceInfo: {
      deviceId: string;
      deviceName: string;
      model: string;
      osVersion: string;
      sdkVersion: number;
      manufacturer: string;
    }
  ): Promise<{ token: string; userId: string; deviceId: string; role: DeviceRole }> {
    const userResult = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) throw new Error('Invalid email or password');

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Invalid email or password');

    const existingDevice = await query('SELECT * FROM devices WHERE device_id = $1', [deviceInfo.deviceId]);
    let role: DeviceRole;

    if (existingDevice.rows.length === 0) {
      const countResult = await query('SELECT COUNT(*) FROM devices WHERE user_id = $1', [user.id]);
      role = parseInt(countResult.rows[0].count) === 0 ? DeviceRole.OWNER : DeviceRole.CLIENT;
      await query(
        `INSERT INTO devices (device_id, user_id, device_name, model, os_version, sdk_version, manufacturer, role, status, last_heartbeat)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [deviceInfo.deviceId, user.id, deviceInfo.deviceName, deviceInfo.model,
         deviceInfo.osVersion, deviceInfo.sdkVersion, deviceInfo.manufacturer,
         role, DeviceStatus.OFFLINE, Date.now()]
      );
    } else {
      role = existingDevice.rows[0].role as DeviceRole;
    }

    const { DeviceRegistry } = await import('../websocket/deviceRegistry');
    DeviceRegistry.loadOrUpdate({
      deviceId: deviceInfo.deviceId, userId: user.id, deviceName: deviceInfo.deviceName,
      model: deviceInfo.model, osVersion: deviceInfo.osVersion,
      sdkVersion: deviceInfo.sdkVersion, manufacturer: deviceInfo.manufacturer,
      role, status: DeviceStatus.OFFLINE, lastHeartbeat: Date.now(), registeredAt: new Date(),
    });

    const token = AuthService.generateToken({ userId: user.id, email, deviceId: deviceInfo.deviceId });
    return { token, userId: user.id, deviceId: deviceInfo.deviceId, role };
  }

  static generateToken(payload: AuthPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  static verifyToken(token: string): AuthPayload {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  }
}
