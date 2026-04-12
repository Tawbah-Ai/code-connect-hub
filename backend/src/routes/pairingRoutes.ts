import { Router, Request, Response } from 'express';
import { query } from '../db/database';

const router = Router();

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    await query(
      `DELETE FROM device_pairing_codes WHERE owner_user_id = $1 AND used_at IS NULL AND expires_at < NOW()`,
      [userId]
    );

    let code: string = '';
    let attempts = 0;
    while (true) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await query(
        `SELECT id FROM device_pairing_codes WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [code]
      );
      if (existing.rows.length === 0) break;
      attempts++;
      if (attempts > 10) {
        res.status(500).json({ error: 'Could not generate unique code, try again' });
        return;
      }
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const result = await query(
      `INSERT INTO device_pairing_codes (owner_user_id, code, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, owner_user_id, code, expires_at, used_at, used_by_device_id, created_at`,
      [userId, code, expiresAt.toISOString()]
    );

    res.json(result.rows[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate pairing code';
    res.status(500).json({ error: message });
  }
});

router.post('/claim', async (req: Request, res: Response) => {
  try {
    const { code, deviceId, deviceName, model, osVersion, manufacturer } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Pairing code must be 6 digits' });
      return;
    }
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    const codeResult = await query(
      `SELECT * FROM device_pairing_codes
       WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [code]
    );

    if (codeResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired pairing code' });
      return;
    }

    const codeRow = codeResult.rows[0];

    await query(
      `UPDATE device_pairing_codes
       SET used_at = NOW(), used_by_device_id = $1
       WHERE id = $2`,
      [deviceId, codeRow.id]
    );

    res.json({
      device_uuid: deviceId,
      owner_user_id: codeRow.owner_user_id,
      role: 'CLIENT',
      success: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pairing failed';
    res.status(500).json({ error: message });
  }
});

export default router;
