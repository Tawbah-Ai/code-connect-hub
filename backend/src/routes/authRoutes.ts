import { Router, Request, Response } from 'express';
import { AuthService } from '../auth/authService';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, device } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (!device?.deviceId) {
      res.status(400).json({ error: 'Device info is required' });
      return;
    }

    const result = await AuthService.register(email, password, {
      deviceId: device.deviceId,
      deviceName: device.deviceName || 'Unknown',
      model: device.model || 'Unknown',
      osVersion: device.osVersion || 'Unknown',
      sdkVersion: device.sdkVersion || 0,
      manufacturer: device.manufacturer || 'Unknown',
    });

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ error: message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, device } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const deviceInfo = device || {
      deviceId: `dashboard-${Date.now()}`,
      deviceName: 'Web Dashboard',
      model: 'Browser',
      osVersion: 'Web',
      sdkVersion: 0,
      manufacturer: 'Web',
    };

    const result = await AuthService.login(email, password, deviceInfo);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    res.status(401).json({ error: message });
  }
});

export default router;
