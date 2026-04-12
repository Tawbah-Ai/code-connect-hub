import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

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

const pairingCodes = new Map<string, PairingEntry>();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of pairingCodes.entries()) {
    if (new Date(entry.expires_at).getTime() < now) {
      pairingCodes.delete(key);
    }
  }
}

router.post('/generate', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    purgeExpired();

    for (const [key, entry] of pairingCodes.entries()) {
      if (entry.owner_user_id === userId && !entry.used_at) {
        pairingCodes.delete(key);
      }
    }

    let code = '';
    for (let attempts = 0; attempts < 10; attempts++) {
      const candidate = Math.floor(100000 + Math.random() * 900000).toString();
      if (!pairingCodes.has(candidate)) {
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

    const entry: PairingEntry = {
      id: uuidv4(),
      owner_user_id: userId,
      code,
      expires_at: expiresAt.toISOString(),
      used_at: null,
      used_by_device_id: null,
      created_at: now.toISOString(),
    };

    pairingCodes.set(code, entry);

    res.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate pairing code';
    res.status(500).json({ error: message });
  }
});

router.post('/claim', (req: Request, res: Response) => {
  try {
    const { code, deviceId } = req.body;

    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Pairing code must be 6 digits' });
      return;
    }
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    purgeExpired();

    const entry = pairingCodes.get(code);
    if (!entry || entry.used_at || new Date(entry.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Invalid or expired pairing code' });
      return;
    }

    entry.used_at = new Date().toISOString();
    entry.used_by_device_id = deviceId;

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

router.get('/check/:code', (req: Request, res: Response) => {
  try {
    purgeExpired();
    const entry = pairingCodes.get(req.params.code);
    if (!entry || entry.used_at || new Date(entry.expires_at).getTime() < Date.now()) {
      res.json({ valid: false });
      return;
    }
    res.json({ valid: true, owner_user_id: entry.owner_user_id, expires_at: entry.expires_at });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
