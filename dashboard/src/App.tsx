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
  Cpu,
  Clock3,
  Radio,
  KeyRound,
  Copy,
  Bell,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  LayoutDashboard,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { api } from './services/api';
import type { Device, Command, ControlMode, LogEntry, PairingCode, AppNotification } from './types';
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
              autoComplete="email"
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
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
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

function ScreenViewer({ device, onClose, onSendCommand }: { device: Device; onClose: () => void; onSendCommand: (type: string, payload?: Record<string, unknown>) => void | Promise<void> }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [streamStarted, setStreamStarted] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const startStream = () => {
    onSendCommand('START_STREAM');
    setStreamStarted(true);
  };

  const stopStream = () => {
    onSendCommand('STOP_STREAM');
    setStreamStarted(false);
    setConnected(false);
  };

  useEffect(() => {
    api.subscribeToScreenStream(device.id, (frameData: string) => {
      setFrame(frameData);
      setConnected(true);
    });

    startStream();

    return () => {
      api.unsubscribeFromScreenStream();
      onSendCommand('STOP_STREAM');
    };
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen-viewer-overlay">
      <div className="screen-viewer">
        <div className="screen-viewer-header">
          <div className="screen-viewer-title">
            <Tv size={16} />
            <span>Live Screen: {device.device_name}</span>
            <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
            <span className="stream-state">{streamStarted ? 'Streaming' : 'Stopped'}</span>
          </div>
          <div className="screen-viewer-actions">
            <button className="stream-action" onClick={startStream} disabled={streamStarted}>
              Start
            </button>
            <button className="stream-action danger" onClick={stopStream} disabled={!streamStarted}>
              Stop
            </button>
            <button className="screen-viewer-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
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
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'notifications'>('dashboard');

  const userEmail = session.user.email || 'User';
  const userId = session.user.id;
  const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
  const clientCount = devices.filter((d) => d.role === 'CLIENT').length;
  const ownerCount = devices.filter((d) => d.role === 'OWNER').length;
  const lastSeen = selectedDevice?.last_seen
    ? new Date(selectedDevice.last_seen).toLocaleString()
    : 'No device selected';

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

  const addNotification = useCallback((
    level: AppNotification['level'],
    title: string,
    message: string,
    deviceName?: string
  ) => {
    setNotifications((prev) => [
      {
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(),
        level,
        title,
        message,
        read: false,
        deviceName,
      },
      ...prev.slice(0, 199),
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
      setDevices((prevDevices) => {
        updatedDevices.forEach((d) => {
          const prev = prevDevices.find((p) => p.id === d.id);
          if (prev && prev.status !== d.status) {
            if (d.status === 'ONLINE') {
              addNotification('success', 'Device Online', `${d.device_name} is now connected.`, d.device_name);
            } else {
              addNotification('warning', 'Device Offline', `${d.device_name} has disconnected.`, d.device_name);
            }
          }
        });
        const newDevices = updatedDevices.filter(
          (d) => !prevDevices.some((p) => p.id === d.id)
        );
        newDevices.forEach((d) => {
          addNotification('info', 'New Device Registered', `${d.device_name} has been added to your account.`, d.device_name);
        });
        return updatedDevices;
      });
    });

    // Subscribe to realtime command updates
    api.subscribeToCommands(userId, (command: Command) => {
      if (command.status === 'EXECUTED') {
        addLog('result', `Command ${command.type} executed successfully`, command.result);
        addNotification('success', 'Command Executed', `${command.type} completed successfully.`);
      } else if (command.status === 'FAILED') {
        addLog('error', `Command ${command.type} failed`, command.result);
        addNotification('error', 'Command Failed', `${command.type} failed to execute.`);
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

  const generatePairingCode = async () => {
    setPairingLoading(true);
    try {
      const code = await api.createPairingCode();
      setPairingCode(code);
      addLog('info', `Pairing code ${code.code} created. It expires in 15 minutes.`);
    } catch (err) {
      addLog('error', `Pairing code failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setPairingLoading(false);
    }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode.code);
    addLog('info', 'Pairing code copied to clipboard');
  };

  const isDeviceOnline = selectedDevice?.status === 'ONLINE';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => setNotifications([]);

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
            <button
              className={`btn-notif ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(activeTab === 'notifications' ? 'dashboard' : 'notifications');
                if (activeTab !== 'notifications') markAllRead();
              }}
              title="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </button>
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

        {/* Tab Navigation */}
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Dashboard
          </button>
          <button
            className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => { setActiveTab('notifications'); markAllRead(); }}
          >
            <Bell size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Notifications
            {unreadCount > 0 && (
              <span className="tab-badge">{unreadCount}</span>
            )}
          </button>
        </div>

        {/* Notifications Panel */}
        {activeTab === 'notifications' && (
          <div className="notifications-page">
            <div className="glass-card">
              <div className="card-header">
                <span className="card-title">
                  <Bell size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  Alerts & Notifications
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {notifications.length > 0 && (
                    <>
                      <button className="notif-action-btn" onClick={markAllRead} title="Mark all as read">
                        <CheckCheck size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Mark read
                      </button>
                      <button className="notif-action-btn danger" onClick={clearNotifications} title="Clear all">
                        <X size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Clear all
                      </button>
                    </>
                  )}
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="empty-state">
                  <Bell size={40} />
                  <h3>No notifications</h3>
                  <p>Alerts will appear here when devices connect, disconnect, or commands are executed.</p>
                </div>
              ) : (
                <div className="notif-list">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`notif-item ${notif.level} ${notif.read ? 'read' : 'unread'}`}
                      onClick={() => setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))}
                    >
                      <div className="notif-icon">
                        {notif.level === 'success' && <CheckCircle2 size={18} />}
                        {notif.level === 'warning' && <AlertTriangle size={18} />}
                        {notif.level === 'error' && <AlertCircle size={18} />}
                        {notif.level === 'info' && <Bell size={18} />}
                      </div>
                      <div className="notif-body">
                        <div className="notif-header-row">
                          <span className="notif-title">{notif.title}</span>
                          {notif.deviceName && (
                            <span className="notif-device">
                              <Smartphone size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                              {notif.deviceName}
                            </span>
                          )}
                          {!notif.read && <span className="notif-dot" />}
                        </div>
                        <p className="notif-message">{notif.message}</p>
                        <span className="notif-time">{notif.timestamp.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && <>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon cyan"><Smartphone size={18} /></div>
            <div>
              <span>Total Devices</span>
              <strong>{devices.length}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green"><Radio size={18} /></div>
            <div>
              <span>Online Now</span>
              <strong>{onlineCount}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple"><Cpu size={18} /></div>
            <div>
              <span>Clients / Owners</span>
              <strong>{clientCount}/{ownerCount}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon blue"><Clock3 size={18} /></div>
            <div>
              <span>Selected Last Seen</span>
              <strong className="stat-small">{lastSeen}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Device List */}
          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Devices</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {onlineCount}/{devices.length} online
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

          <div className="glass-card">
            <div className="card-header">
              <span className="card-title">Device Pairing</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                6-digit owner code
              </span>
            </div>
            <div className="pairing-panel">
              <div className="pairing-icon">
                <KeyRound size={24} />
              </div>
              <div className="pairing-copy">
                <h3>Pair an Android client without sharing your login</h3>
                <p>Generate a code, then enter it in the Android agent during login or registration.</p>
              </div>
              {pairingCode && (
                <div className="pairing-code-row">
                  <div>
                    <span>Pairing code</span>
                    <strong>{pairingCode.code}</strong>
                    <small>Expires {new Date(pairingCode.expires_at).toLocaleTimeString()}</small>
                  </div>
                  <button className="btn-primary" onClick={copyPairingCode}>
                    <Copy size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Copy
                  </button>
                </div>
              )}
              <button className="btn-primary pairing-generate" onClick={generatePairingCode} disabled={pairingLoading}>
                {pairingLoading ? 'Generating...' : pairingCode ? 'Generate New Code' : 'Generate Pairing Code'}
              </button>
            </div>
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
        </>}
      </div>

      {/* Screen Viewer Modal */}
      {showScreenViewer && selectedDevice && (
        <ScreenViewer
          device={selectedDevice}
          onClose={() => setShowScreenViewer(false)}
          onSendCommand={(type, payload = {}) => sendCommand(type, payload)}
        />
      )}
    </div>
  );
}

function ConfigurationRequired() {
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
          <div className="login-sub">Configuration Required</div>
        </div>
        <div className="error-msg" style={{ textAlign: 'left', lineHeight: 1.6 }}>
          <strong>Supabase credentials are not set.</strong>
          <br /><br />
          Please add the following environment variables to run this app:
          <br /><br />
          <code style={{ display: 'block', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, fontSize: 12, wordBreak: 'break-all' }}>
            VITE_SUPABASE_URL<br />
            VITE_SUPABASE_ANON_KEY
          </code>
          <br />
          You can find these values in your Supabase project settings under <strong>API</strong>.
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

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

function App() {
  if (!isSupabaseConfigured) {
    return <ConfigurationRequired />;
  }
  return <AppContent />;
}

export default App;
