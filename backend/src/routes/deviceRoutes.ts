import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { DeviceRegistry } from '../websocket/deviceRegistry';
import { WSServer } from '../websocket/wsServer';

const router = Router();

router.use(authMiddleware);

function toSnakeCase(device: ReturnType<typeof DeviceRegistry.getDevice>) {
  if (!device) return null;
  return {
    id: device.deviceId,
    device_id: device.deviceId,
    user_id: device.userId,
    device_name: device.deviceName,
    model: device.model,
    os_version: device.osVersion,
    manufacturer: device.manufacturer,
    role: device.role,
    status: WSServer.isDeviceConnected(device.deviceId) ? 'ONLINE' : 'OFFLINE',
    last_seen: new Date(device.lastHeartbeat || 0).toISOString(),
    created_at: device.registeredAt.toISOString(),
  };
}

// Get all devices for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await DeviceRegistry.loadDevicesFromDB(userId);
  const devices = DeviceRegistry.getUserDevices(userId);
  res.json({ devices: devices.map((d) => toSnakeCase(d)).filter(Boolean) });
});

// Get specific device
router.get('/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const device = DeviceRegistry.getDevice(deviceId);

  if (!device || device.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  res.json({
    ...device,
    isConnected: WSServer.isDeviceConnected(device.deviceId),
  });
});

// Send command to device
router.post('/:deviceId/command', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { type, payload } = req.body;

  if (!type) {
    res.status(400).json({ error: 'Command type is required' });
    return;
  }

  const device = DeviceRegistry.getDevice(deviceId);
  if (!device || device.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  const result = WSServer.sendCommandToDevice(
    deviceId,
    type,
    payload || {},
    req.user!.userId
  );

  if (result.success) {
    res.json({ success: true, commandId: result.commandId });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// Remove device
router.delete('/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const device = DeviceRegistry.getDevice(deviceId);

  if (!device || device.userId !== req.user!.userId) {
    res.status(404).json({ error: 'Device not found' });
    return;
  }

  DeviceRegistry.removeDevice(deviceId);
  res.json({ success: true, message: 'Device removed' });
});

export default router;
