import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { User, Device, DeviceRole, DeviceStatus, AuthPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'hybrid-control-secret-key-change-in-production';
const TOKEN_EXPIRY = '30d';

// In-memory stores (replace with database in production)
const users: Map<string, User> = new Map();
const usersByEmail: Map<string, User> = new Map();

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
    if (usersByEmail.has(email)) {
      throw new Error('Email already registered');
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    const user: User = {
      id: userId,
      email,
      passwordHash,
      createdAt: new Date(),
    };

    users.set(userId, user);
    usersByEmail.set(email, user);

    // First device is always OWNER
    const { DeviceRegistry } = await import('../websocket/deviceRegistry');
    const role = DeviceRegistry.getUserDeviceCount(userId) === 0 ? DeviceRole.OWNER : DeviceRole.CLIENT;

    const device: Device = {
      deviceId: deviceInfo.deviceId,
      userId,
      deviceName: deviceInfo.deviceName,
      model: deviceInfo.model,
      osVersion: deviceInfo.osVersion,
      sdkVersion: deviceInfo.sdkVersion,
      manufacturer: deviceInfo.manufacturer,
      role,
      status: DeviceStatus.OFFLINE,
      lastHeartbeat: Date.now(),
      registeredAt: new Date(),
    };

    DeviceRegistry.registerDevice(device);

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
    const user = usersByEmail.get(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    const { DeviceRegistry } = await import('../websocket/deviceRegistry');

    let device = DeviceRegistry.getDevice(deviceInfo.deviceId);
    if (!device) {
      const role = DeviceRegistry.getUserDeviceCount(user.id) === 0
        ? DeviceRole.OWNER
        : DeviceRole.CLIENT;

      device = {
        deviceId: deviceInfo.deviceId,
        userId: user.id,
        deviceName: deviceInfo.deviceName,
        model: deviceInfo.model,
        osVersion: deviceInfo.osVersion,
        sdkVersion: deviceInfo.sdkVersion,
        manufacturer: deviceInfo.manufacturer,
        role,
        status: DeviceStatus.OFFLINE,
        lastHeartbeat: Date.now(),
        registeredAt: new Date(),
      };

      DeviceRegistry.registerDevice(device);
    }

    const token = AuthService.generateToken({
      userId: user.id,
      email,
      deviceId: deviceInfo.deviceId,
    });

    return { token, userId: user.id, deviceId: deviceInfo.deviceId, role: device.role };
  }

  static generateToken(payload: AuthPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  }

  static verifyToken(token: string): AuthPayload {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  }

  static getUser(userId: string): User | undefined {
    return users.get(userId);
  }

  static getUserByEmail(email: string): User | undefined {
    return usersByEmail.get(email);
  }
}
