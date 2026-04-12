import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Smartphone,
  Wifi,
  Play,
  FolderOpen,
  Trash2,
  Camera,
  Info,
  Monitor,
  MousePointer,
  Type,
  ArrowUpDown,
  Zap,
  LogOut,
  User,
  Shield,
  Battery,
  HardDrive,
  AppWindow,
  Tv,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { api } from './services/api';
import type { Device, Command, ControlMode, LogEntry } from './types';
import type { Session } from '@supabase/supabase-js';
import './App.css';

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        await api.register(email, password);
      } else {
        await api.login(email, password);
      }
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="app-bg">
        <div className="app-bg-orb app-bg-orb-1" />
        <div className="app-bg-orb app-bg-orb-2" />
      </div>
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <Shield size={32} color="#000" />
          </div>
          <div className="login-title">HYBRID CONTROL</div>
          <div className="login-sub">Remote Device Management System</div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="btn-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : isRegistering ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => setIsRegistering(!isRegistering)}>
            {isRegistering ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScreenViewer({ device, onClose }: { device: Device; onClose: () => void }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    api.subscribeToScreenStream(device.id, (frameData: string) => {
      setFrame(frameData);
      setConnected(true);
    });

    return () => {
      api.unsubscribeFromScreenStream();
    };
  }, [device.id]);

  return (
    <div className="screen-viewer-overlay">
      <div className="screen-viewer">
        <div className="screen-viewer-header">
          <div className="screen-viewer-title">
            <Tv size={16} />
            <span>Live Screen: {device.device_name}</span>
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          </div>
          <button className="screen-viewer-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="screen-viewer-content">
          {frame ? (
            <img
              ref={imgRef}
              src={`data:image/jpeg;base64,${frame}`}
              alt="Device Screen"
              className="screen-frame"
            />
          ) : (
            <div className="screen-viewer-placeholder">
              <Tv size={48} />
              <p>Waiting for screen stream...</p>
              <p className="screen-hint">
                {device.status === 'ONLINE'
                  ? 'Device is online. Stream will appear when the agent sends frames.'
                  : 'Device is offline. Connect the device to start streaming.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [controlMode, setControlMode] = useState<ControlMode>('HYBRID');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tapX, setTapX] = useState('');
  const [tapY, setTapY] = useState('');
  const [inputText, setInputText] = useState('');
  const [filePath, setFilePath] = useState('');
  const [packageName, setPackageName] = useState('');
  const [showScreenViewer, setShowScreenViewer] = useState(false);

  const userEmail = session.user.email || 'User';
  const userId = session.user.id;

  const addLog = useCallback((type: LogEntry['type'], message: string, data?: unknown) => {
    setLogs((prev) => [
      {
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(),
        type,
        message,
        data,
      },
      ...prev.slice(0, 99),
    ]);
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const result = await api.getDevices();
      setDevices(result);
    } catch (err) {
      addLog('error', `Failed to fetch devices: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, [addLog]);

  // Initial fetch + realtime subscription
  useEffect(() => {
    fetchDevices();

    // Subscribe to realtime device changes
    api.subscribeToDevices(userId, (updatedDevices) => {
      setDevices(updatedDevices);
    });

    // Subscribe to realtime command updates
    api.subscribeToCommands(userId, (command: Command) => {
      if (command.status === 'EXECUTED') {
        addLog('result', `Command ${command.type} executed successfully`, command.result);
      } else if (command.status === 'FAILED') {
        addLog('error', `Command ${command.type} failed`, command.result);
      }
    });

    return () => {
      api.unsubscribeAll();
    };
  }, [fetchDevices, userId, addLog]);

  // Keep selectedDevice in sync with latest device data from realtime updates
  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find((d) => d.id === selectedDevice.id);
      if (updated) {
        setSelectedDevice(updated);
      } else {
        setSelectedDevice(null);
      }
    }
  }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCommand = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!selectedDevice) {
      addLog('error', 'No device selected');
      return;
    }

    setLoading(true);
    addLog('command', `Sending ${type} to ${selectedDevice.device_name}`);

    try {
      const result = await api.sendCommand(selectedDevice.id, type, payload);
      addLog('info', `Command queued: ${type} (ID: ${result.id.substring(0, 8)})`);
    } catch (err) {
      addLog('error', `Command failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    onLogout();
  };

  const isDeviceOnline = selectedDevice?.status === 'ONLINE';

  return (
    <div className="app-container">
      <div className="app-bg">
        <div className="app-bg-orb app-bg-orb-1" />
        <div className="app-bg-orb app-bg-orb-2" />
        <div className="app-bg-orb app-bg-orb-3" />
      </div>

      <div className="app-content">
        {/* Header */}
        <header className="header">
          <div className="header-brand">
            <div className="header-icon">
              <Shield size={22} color="#000" />
            </div>
            <div>
              <div className="header-title">HYBRID CONTROL</div>
              <div className="header-subtitle">Device Management</div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-user">
              <User size={16} />
              <span>{userEmail}</span>
            </div>
            <button className="btn-logout" onClick={handleLogout}>
              <LogOut size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Logout
            </button>
          </div>
        </header>

        <div className="dashboard-grid">
          {/* Device List */}
          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Devices</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {devices.filter((d) => d.status === 'ONLINE').length}/{devices.length} online
              </span>
            </div>
            {devices.length === 0 ? (
              <div className="empty-state">
                <Smartphone size={40} />
                <h3>No devices connected</h3>
                <p>Install the Android agent and sign in to connect devices</p>
              </div>
            ) : (
              <div className="device-list">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className={`device-item ${selectedDevice?.id === device.id ? 'selected' : ''}`}
                    onClick={() => setSelectedDevice(device)}
                  >
                    <div className="device-info">
                      <div className="device-icon">
                        <Smartphone size={22} color="var(--accent-cyan)" />
                      </div>
                      <div className="device-details">
                        <h3>{device.device_name}</h3>
                        <p>{device.model} - {device.os_version}</p>
                      </div>
                    </div>
                    <div className="device-meta">
                      <span className={`role-badge ${device.role.toLowerCase()}`}>
                        {device.role}
                      </span>
                      <span className={`status-badge ${device.status === 'ONLINE' ? 'online' : 'offline'}`}>
                        <span className={`status-dot ${device.status === 'ONLINE' ? 'online' : 'offline'}`} />
                        {device.status === 'ONLINE' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Command Panel */}
          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Commands</span>
              {selectedDevice && (
                <span style={{ fontSize: 12, color: 'var(--accent-cyan)' }}>
                  Target: {selectedDevice.device_name}
                </span>
              )}
            </div>

            {!selectedDevice ? (
              <div className="empty-state">
                <Monitor size={40} />
                <h3>Select a device</h3>
                <p>Choose a device from the list to send commands</p>
              </div>
            ) : (
              <>
                {/* Live Screen Button */}
                {selectedDevice.role === 'CLIENT' && (
                  <button
                    className="btn-screen-view"
                    onClick={() => setShowScreenViewer(true)}
                    disabled={!isDeviceOnline}
                  >
                    <Tv size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    View Live Screen
                  </button>
                )}

                {/* System Commands */}
                <div className="command-grid">
                  <button
                    className="command-btn"
                    onClick={() => sendCommand('DEVICE_INFO')}
                    disabled={loading || !isDeviceOnline}
                  >
                    <Info size={20} />
                    Device Info
                  </button>
                  <button
                    className="command-btn"
                    onClick={() => sendCommand('TAKE_SCREENSHOT')}
                    disabled={loading || !isDeviceOnline}
                  >
                    <Camera size={20} />
                    Screenshot
                  </button>
                  <button
                    className="command-btn"
                    onClick={() => sendCommand('LIST_APPS')}
                    disabled={loading || !isDeviceOnline}
                  >
                    <AppWindow size={20} />
                    List Apps
                  </button>
                  <button
                    className="command-btn"
                    onClick={() => sendCommand('GET_BATTERY')}
                    disabled={loading || !isDeviceOnline}
                  >
                    <Battery size={20} />
                    Battery
                  </button>
                  <button
                    className="command-btn"
                    onClick={() => sendCommand('GET_STORAGE_INFO')}
                    disabled={loading || !isDeviceOnline}
                  >
                    <HardDrive size={20} />
                    Storage
                  </button>
                </div>

                {/* Open App */}
                <div style={{ marginTop: 16 }}>
                  <div className="touch-input-row">
                    <input
                      className="touch-input"
                      placeholder="Package name (e.g. com.android.chrome)"
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (packageName) sendCommand('OPEN_APP', { packageName });
                      }}
                      disabled={loading || !isDeviceOnline || !packageName}
                    >
                      <Play size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      Open
                    </button>
                  </div>
                </div>

                {/* File Commands */}
                <div style={{ marginTop: 12 }}>
                  <div className="touch-input-row">
                    <input
                      className="touch-input"
                      placeholder="File path (e.g. /sdcard/Download)"
                      value={filePath}
                      onChange={(e) => setFilePath(e.target.value)}
                    />
                    <button
                      className="btn-primary"
                      onClick={() => sendCommand('GET_FILES', { path: filePath || undefined })}
                      disabled={loading || !isDeviceOnline}
                      style={{ minWidth: 'auto' }}
                    >
                      <FolderOpen size={14} />
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (filePath && confirm(`Delete ${filePath}?`)) {
                          sendCommand('DELETE_FILE', { path: filePath });
                        }
                      }}
                      disabled={loading || !isDeviceOnline || !filePath}
                      style={{ minWidth: 'auto', background: 'var(--accent-red)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Control Mode */}
          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Control Mode</span>
            </div>
            <div className="mode-selector">
              {(['COMMAND', 'TOUCH', 'HYBRID'] as ControlMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`mode-btn ${controlMode === mode ? 'active' : ''}`}
                  onClick={() => setControlMode(mode)}
                >
                  {mode === 'COMMAND' && <Zap size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                  {mode === 'TOUCH' && <MousePointer size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                  {mode === 'HYBRID' && <ArrowUpDown size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                  {mode}
                </button>
              ))}
            </div>

            {(controlMode === 'TOUCH' || controlMode === 'HYBRID') && selectedDevice && (
              <div className="touch-panel" style={{ marginTop: 16 }}>
                <div className="touch-input-row">
                  <input
                    className="touch-input"
                    type="number"
                    placeholder="X"
                    value={tapX}
                    onChange={(e) => setTapX(e.target.value)}
                  />
                  <input
                    className="touch-input"
                    type="number"
                    placeholder="Y"
                    value={tapY}
                    onChange={(e) => setTapY(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => sendCommand('TAP', { x: Number(tapX), y: Number(tapY) })}
                    disabled={loading || !isDeviceOnline || !tapX || !tapY}
                  >
                    Tap
                  </button>
                </div>
                <div className="touch-input-row">
                  <input
                    className="touch-input"
                    placeholder="Text to input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (inputText) sendCommand('INPUT_TEXT', { text: inputText });
                    }}
                    disabled={loading || !isDeviceOnline || !inputText}
                  >
                    <Type size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Send
                  </button>
                </div>
                <div className="touch-input-row">
                  {['up', 'down', 'left', 'right'].map((dir) => (
                    <button
                      key={dir}
                      className="btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => sendCommand('SCROLL', { direction: dir })}
                      disabled={loading || !isDeviceOnline}
                    >
                      Scroll {dir}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Activity Log</span>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
                onClick={() => setLogs([])}
              >
                Clear
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="empty-state">
                <Wifi size={32} />
                <p>No activity yet</p>
              </div>
            ) : (
              <div className="log-container">
                {logs.map((log) => (
                  <div key={log.id} className={`log-entry ${log.type}`}>
                    <span className="log-time">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screen Viewer Modal */}
      {showScreenViewer && selectedDevice && (
        <ScreenViewer
          device={selectedDevice}
          onClose={() => setShowScreenViewer(false)}
        />
      )}
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="login-page">
        <div className="app-bg">
          <div className="app-bg-orb app-bg-orb-1" />
          <div className="app-bg-orb app-bg-orb-2" />
        </div>
        <div style={{ color: '#fff', fontSize: 18 }}>Loading...</div>
      </div>
    );
  }

  return session ? (
    <Dashboard session={session} onLogout={() => setSession(null)} />
  ) : (
    <LoginPage onLogin={() => {
      supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    }} />
  );
}

export default App;
