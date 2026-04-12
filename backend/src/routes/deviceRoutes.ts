import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { DeviceRegistry } from '../websocket/deviceRegistry';
import { WSServer } from '../websocket/wsServer';

const router = Router();

router.use(authMiddleware);

// Get all devices for the authenticated user
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const devices = DeviceRegistry.getUserDevices(userId);

  const devicesWithStatus = devices.map((device) => ({
    ...device,
    isConnected: WSServer.isDeviceConnected(device.deviceId),
    status: WSServer.isDeviceConnected(device.deviceId) ? 'online' : 'offline',
  }));

  res.json({ devices: devicesWithStatus });
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
