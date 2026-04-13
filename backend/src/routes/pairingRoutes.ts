import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/authMiddleware';
import { query } from '../db/database';
import { DeviceRegistry } from '../websocket/deviceRegistry';
import { DeviceRole, DeviceStatus } from '../types';

const router = Router();

interface PairingEntry {
  id: string;
  owner_user_id: string;
  code: string;
  expires_at: string;
  used_at: string | null;
  used_by_device_id: string | null;
  created_at: string;
}

router.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    let code = '';
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await query(
        'SELECT 1 FROM pairing_codes WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()',
        [candidate]
      );
      if (existing.rows.length === 0) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      res.status(500).json({ error: 'Could not generate unique code, try again' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const id = uuidv4();

    await query(
      'UPDATE pairing_codes SET used_at = NOW() WHERE owner_user_id = $1 AND used_at IS NULL',
      [userId]
    );
    const result = await query(
      `INSERT INTO pairing_codes (id, owner_user_id, code, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_user_id, code, expires_at, used_at, used_by_device_id, created_at`,
      [id, userId, code, expiresAt, now]
    );
    const entry = result.rows[0] as PairingEntry;

    res.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate pairing code';
    res.status(500).json({ error: message });
  }
});

router.post('/claim', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code, deviceId, deviceName, model, osVersion, sdkVersion, manufacturer } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Pairing code must be 6 digits' });
      return;
    }
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    const codeResult = await query(
      `SELECT id, owner_user_id, code, expires_at, used_at, used_by_device_id, created_at
       FROM pairing_codes
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at ASC
       LIMIT 1`,
      [code]
    );
    const entry = codeResult.rows[0] as PairingEntry | undefined;
    if (!entry) {
      res.status(400).json({ error: 'Invalid or expired pairing code' });
      return;
    }

    await query(
      `INSERT INTO devices (
         device_id, user_id, device_name, model, os_version, sdk_version,
         manufacturer, role, status, last_heartbeat
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'CLIENT', 'OFFLINE', $8)
       ON CONFLICT (device_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         device_name = EXCLUDED.device_name,
         model = EXCLUDED.model,
         os_version = EXCLUDED.os_version,
         sdk_version = EXCLUDED.sdk_version,
         manufacturer = EXCLUDED.manufacturer,
         role = 'CLIENT',
         status = 'OFFLINE',
         last_heartbeat = EXCLUDED.last_heartbeat`,
      [
        deviceId,
        entry.owner_user_id,
        deviceName || 'Android Agent',
        model || 'Android',
        osVersion || 'Unknown',
        Number(sdkVersion || 0),
        manufacturer || 'Unknown',
        Date.now(),
      ]
    );

    await query(
      'UPDATE pairing_codes SET used_at = NOW(), used_by_device_id = $1 WHERE id = $2',
      [deviceId, entry.id]
    );

    DeviceRegistry.loadOrUpdate({
      deviceId,
      userId: entry.owner_user_id,
      deviceName: deviceName || 'Android Agent',
      model: model || 'Android',
      osVersion: osVersion || 'Unknown',
      sdkVersion: Number(sdkVersion || 0),
      manufacturer: manufacturer || 'Unknown',
      role: DeviceRole.CLIENT,
      status: DeviceStatus.OFFLINE,
      lastHeartbeat: Date.now(),
      registeredAt: new Date(),
    });

    res.json({
      device_uuid: deviceId,
      owner_user_id: entry.owner_user_id,
      role: 'CLIENT',
      success: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pairing failed';
    res.status(500).json({ error: message });
  }
});

router.get('/check/:code', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT owner_user_id, expires_at
       FROM pairing_codes
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [req.params.code]
    );
    const entry = result.rows[0] as Pick<PairingEntry, 'owner_user_id' | 'expires_at'> | undefined;
    if (!entry) {
      res.json({ valid: false });
      return;
    }
    res.json({ valid: true, owner_user_id: entry.owner_user_id, expires_at: entry.expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
