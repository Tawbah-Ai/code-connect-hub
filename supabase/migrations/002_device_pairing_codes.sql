ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_devices_linked_user_id ON devices(linked_user_id);

CREATE TABLE IF NOT EXISTS device_pairing_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_by_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_owner ON device_pairing_codes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_code ON device_pairing_codes(code);
CREATE INDEX IF NOT EXISTS idx_device_pairing_codes_active ON device_pairing_codes(code, expires_at) WHERE used_at IS NULL;

ALTER TABLE device_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can create pairing codes"
  ON device_pairing_codes FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners can view pairing codes"
  ON device_pairing_codes FOR SELECT
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Owners can update pairing codes"
  ON device_pairing_codes FOR UPDATE
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Linked clients can view assigned device"
  ON devices FOR SELECT
  USING (auth.uid() = linked_user_id);

CREATE POLICY "Linked clients can update assigned device"
  ON devices FOR UPDATE
  USING (auth.uid() = linked_user_id)
  WITH CHECK (auth.uid() = linked_user_id);

CREATE POLICY "Linked clients can view commands for assigned device"
  ON commands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.id = commands.device_id
        AND devices.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "Linked clients can update commands for assigned device"
  ON commands FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.id = commands.device_id
        AND devices.linked_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.id = commands.device_id
        AND devices.linked_user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can view linked client logs"
  ON logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.id = logs.device_id
        AND devices.user_id = auth.uid()
    )
  );

CREATE POLICY "Linked clients can insert owner logs"
  ON logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM devices
      WHERE devices.id = logs.device_id
        AND devices.user_id = logs.user_id
        AND devices.linked_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION claim_device_pairing_code(
  p_code TEXT,
  p_device_id TEXT,
  p_device_name TEXT,
  p_model TEXT,
  p_os_version TEXT,
  p_manufacturer TEXT
)
RETURNS TABLE(device_uuid UUID, owner_user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_row device_pairing_codes%ROWTYPE;
  claimed_device_id UUID;
BEGIN
  SELECT *
  INTO code_row
  FROM device_pairing_codes
  WHERE code = p_code
    AND used_at IS NULL
    AND expires_at > NOW()
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired pairing code';
  END IF;

  INSERT INTO devices (
    user_id,
    linked_user_id,
    device_id,
    device_name,
    model,
    os_version,
    manufacturer,
    role,
    status,
    last_seen
  )
  VALUES (
    code_row.owner_user_id,
    auth.uid(),
    p_device_id,
    p_device_name,
    p_model,
    p_os_version,
    p_manufacturer,
    'CLIENT',
    'ONLINE',
    NOW()
  )
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    linked_user_id = EXCLUDED.linked_user_id,
    device_name = EXCLUDED.device_name,
    model = EXCLUDED.model,
    os_version = EXCLUDED.os_version,
    manufacturer = EXCLUDED.manufacturer,
    role = 'CLIENT',
    status = 'ONLINE',
    last_seen = NOW()
  RETURNING devices.id INTO claimed_device_id;

  UPDATE device_pairing_codes
  SET used_at = NOW(),
      used_by_device_id = claimed_device_id
  WHERE id = code_row.id;

  RETURN QUERY SELECT claimed_device_id, code_row.owner_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_device_pairing_code(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;