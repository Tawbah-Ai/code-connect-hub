import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage, Server } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth/authService';
import { DeviceRegistry } from './deviceRegistry';
import { DeviceRole, WSMessage, DeviceRegistration, HeartbeatPayload } from '../types';

interface AuthenticatedSocket {
  ws: WebSocket;
  deviceId: string;
  userId: string;
  email: string;
  isAlive: boolean;
}

const connectedSockets: Map<string, AuthenticatedSocket> = new Map();

export class WSServer {
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private offlineCheckInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWSS();
    this.startHeartbeatChecker();
    this.startOfflineChecker();
    console.log('[WSServer] WebSocket server initialized');
  }

  private setupWSS(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[WSServer] New connection attempt');

      const token = this.extractToken(req);
      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      try {
        const payload = AuthService.verifyToken(token);
        const authSocket: AuthenticatedSocket = {
          ws,
          deviceId: payload.deviceId,
          userId: payload.userId,
          email: payload.email,
          isAlive: true,
        };

        connectedSockets.set(payload.deviceId, authSocket);
        DeviceRegistry.setDeviceOnline(payload.deviceId);

        console.log(`[WSServer] Device connected: ${payload.deviceId}`);

        ws.on('message', (data) => {
          this.handleMessage(authSocket, data.toString());
        });

        ws.on('close', () => {
          connectedSockets.delete(payload.deviceId);
          DeviceRegistry.setDeviceOffline(payload.deviceId);
          console.log(`[WSServer] Device disconnected: ${payload.deviceId}`);
        });

        ws.on('pong', () => {
          authSocket.isAlive = true;
        });

        ws.on('error', (err) => {
          console.error(`[WSServer] Socket error for ${payload.deviceId}:`, err.message);
        });
      } catch (err) {
        console.error('[WSServer] Auth failed:', err);
        ws.close(4001, 'Invalid token');
      }
    });
  }

  private extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  private handleMessage(socket: AuthenticatedSocket, data: string): void {
    try {
      const message: WSMessage = JSON.parse(data);

      switch (message.type) {
        case 'DEVICE_REGISTER':
          this.handleDeviceRegister(socket, message.payload as unknown as DeviceRegistration);
          break;
        case 'HEARTBEAT':
          this.handleHeartbeat(socket, message.payload as unknown as HeartbeatPayload);
          break;
        case 'COMMAND':
          this.handleCommand(socket, message);
          break;
        case 'COMMAND_RESULT':
          this.handleCommandResult(socket, message);
          break;
        default:
          console.log(`[WSServer] Unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error('[WSServer] Error handling message:', err);
      this.sendToSocket(socket, {
        type: 'ERROR',
        payload: { message: 'Invalid message format' },
      });
    }
  }

  private handleDeviceRegister(socket: AuthenticatedSocket, reg: DeviceRegistration): void {
    DeviceRegistry.setDeviceOnline(socket.deviceId);
    console.log(`[WSServer] Device registered via WS: ${socket.deviceId}`);

    this.sendToSocket(socket, {
      type: 'REGISTERED',
      payload: { deviceId: socket.deviceId, status: 'online' },
    });
  }

  private handleHeartbeat(socket: AuthenticatedSocket, heartbeat: HeartbeatPayload): void {
    DeviceRegistry.updateHeartbeat(
      socket.deviceId,
      heartbeat.batteryLevel,
      heartbeat.isScreenOn,
      heartbeat.isUserActive
    );
    socket.isAlive = true;

    this.sendToSocket(socket, {
      type: 'HEARTBEAT_ACK',
      payload: { timestamp: Date.now() },
    });
  }

  private handleCommand(socket: AuthenticatedSocket, message: WSMessage): void {
    const device = DeviceRegistry.getDevice(socket.deviceId);
    if (!device || device.role !== DeviceRole.OWNER) {
      this.sendToSocket(socket, {
        type: 'ERROR',
        payload: { message: 'Only OWNER devices can send commands' },
      });
      return;
    }

    const targetDeviceId = (message.payload as Record<string, unknown>)?.targetDeviceId as string;
    if (!targetDeviceId) {
      this.sendToSocket(socket, {
        type: 'ERROR',
        payload: { message: 'Missing targetDeviceId' },
      });
      return;
    }

    const targetDevice = DeviceRegistry.getDevice(targetDeviceId);
    if (!targetDevice || targetDevice.userId !== socket.userId) {
      this.sendToSocket(socket, {
        type: 'ERROR',
        payload: { message: 'Target device not found or not owned by you' },
      });
      return;
    }

    const targetSocket = connectedSockets.get(targetDeviceId);
    if (!targetSocket) {
      this.sendToSocket(socket, {
        type: 'ERROR',
        payload: { message: 'Target device is offline' },
      });
      return;
    }

    const commandId = uuidv4();
    const commandPayload = (message.payload as Record<string, unknown>)?.command as Record<string, unknown>;

    this.sendToSocket(targetSocket, {
      type: 'COMMAND',
      payload: {
        id: commandId,
        type: commandPayload?.type,
        payload: commandPayload?.payload,
        fromDeviceId: socket.deviceId,
      },
    });

    this.sendToSocket(socket, {
      type: 'COMMAND_SENT',
      payload: { commandId, targetDeviceId },
    });

    console.log(`[WSServer] Command routed: ${commandPayload?.type} -> ${targetDeviceId}`);
  }

  private handleCommandResult(socket: AuthenticatedSocket, message: WSMessage): void {
    const result = message.payload as Record<string, unknown>;
    const ownerDevice = DeviceRegistry.getOwnerDevice(socket.userId);

    if (ownerDevice) {
      const ownerSocket = connectedSockets.get(ownerDevice.deviceId);
      if (ownerSocket) {
        this.sendToSocket(ownerSocket, {
          type: 'COMMAND_RESULT',
          payload: {
            ...result,
            fromDeviceId: socket.deviceId,
          },
        });
      }
    }
  }

  private sendToSocket(socket: AuthenticatedSocket, message: WSMessage): void {
    if (socket.ws.readyState === WebSocket.OPEN) {
      socket.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeatChecker(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [deviceId, socket] of connectedSockets.entries()) {
        if (!socket.isAlive) {
          socket.ws.terminate();
          connectedSockets.delete(deviceId);
          DeviceRegistry.setDeviceOffline(deviceId);
          console.log(`[WSServer] Device timed out: ${deviceId}`);
          continue;
        }
        socket.isAlive = false;
        socket.ws.ping();
      }
    }, 30_000);
  }

  private startOfflineChecker(): void {
    this.offlineCheckInterval = setInterval(() => {
      DeviceRegistry.checkOfflineDevices();
    }, 30_000);
  }

  // Send command from dashboard (REST API)
  static sendCommandToDevice(
    targetDeviceId: string,
    commandType: string,
    payload: Record<string, unknown>,
    fromUserId: string
  ): { success: boolean; commandId?: string; error?: string } {
    const targetSocket = connectedSockets.get(targetDeviceId);
    if (!targetSocket) {
      return { success: false, error: 'Device is offline' };
    }

    const targetDevice = DeviceRegistry.getDevice(targetDeviceId);
    if (!targetDevice || targetDevice.userId !== fromUserId) {
      return { success: false, error: 'Device not found or unauthorized' };
    }

    const commandId = uuidv4();

    if (targetSocket.ws.readyState === WebSocket.OPEN) {
      targetSocket.ws.send(
        JSON.stringify({
          type: 'COMMAND',
          payload: {
            id: commandId,
            type: commandType,
            payload,
            fromDeviceId: 'dashboard',
          },
        })
      );

      return { success: true, commandId };
    }

    return { success: false, error: 'Socket not open' };
  }

  static getConnectedDeviceIds(): string[] {
    return Array.from(connectedSockets.keys());
  }

  static isDeviceConnected(deviceId: string): boolean {
    return connectedSockets.has(deviceId);
  }

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.offlineCheckInterval) clearInterval(this.offlineCheckInterval);
    this.wss.close();
  }
}
