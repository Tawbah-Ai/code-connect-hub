import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Smartphone, Wifi, Play, FolderOpen, Trash2, Camera, Info, Monitor,
  MousePointer, Type, Zap, LogOut, User, Shield, Battery, HardDrive,
  AppWindow, Tv, X, Cpu, Clock3, Radio, KeyRound, Copy, Bell,
  CheckCheck, AlertTriangle, AlertCircle, CheckCircle2, LayoutDashboard,
  ChevronRight, ChevronUp, ChevronDown, ChevronLeft, Folder,
  FileText, Image, Package, RefreshCw, Search, Home, ArrowLeft,
  Terminal, Settings, Layers, Download, Eye,
} from 'lucide-react';
import { api, wsClient } from './services/api';
import type {
  Device, Command, ControlMode, LogEntry, PairingCode, AppNotification,
  FileInfo, AppInfo, DeviceInfo, StorageInfo, DashTab,
} from './types';
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
      if (isRegistering) await api.register(email, password);
      else await api.login(email, password);
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
          <div className="login-logo"><Shield size={32} color="#000" /></div>
          <div className="login-title">HYBRID CONTROL</div>
          <div className="login-sub">Remote Device Management System</div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password"
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password" required />
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

function FileBrowserPanel({
  files, currentPath, loading, onNavigate, onDelete, onRefresh,
}: {
  files: FileInfo[];
  currentPath: string;
  loading: boolean;
  onNavigate: (path: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/sdcard';
    onNavigate(parent);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (f: FileInfo) => {
    if (f.isDirectory) return <Folder size={16} className="file-icon dir" />;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || ''))
      return <Image size={16} className="file-icon img" />;
    if (['apk'].includes(ext || '')) return <Package size={16} className="file-icon apk" />;
    return <FileText size={16} className="file-icon file" />;
  };

  return (
    <div className="file-browser">
      <div className="file-browser-toolbar">
        <button className="fb-btn" onClick={goUp} title="Go up"><ArrowLeft size={14} /></button>
        <button className="fb-btn" onClick={() => onNavigate('/sdcard')} title="Home"><Home size={14} /></button>
        <div className="fb-path">{currentPath || '/sdcard'}</div>
        <button className="fb-btn" onClick={onRefresh} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="fb-search-row">
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input className="fb-search" placeholder="Search files..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="fb-loading"><RefreshCw size={24} className="spin" /><span>Loading...</span></div>
      ) : sorted.length === 0 ? (
        <div className="fb-empty"><Folder size={32} /><p>Empty directory</p></div>
      ) : (
        <div className="fb-list">
          {sorted.map(f => (
            <div key={f.path} className="fb-item" onClick={() => f.isDirectory && onNavigate(f.path)}>
              <div className="fb-item-left">
                {getFileIcon(f)}
                <span className={`fb-name ${f.isDirectory ? 'dir-name' : ''}`}>{f.name}</span>
              </div>
              <div className="fb-item-right">
                {!f.isDirectory && <span className="fb-size">{formatSize(f.size)}</span>}
                <button className="fb-del" onClick={e => { e.stopPropagation(); onDelete(f.path); }}
                  title="Delete">
                  <Trash2 size={12} />
                </button>
                {f.isDirectory && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="fb-footer">{sorted.length} items in {currentPath}</div>
    </div>
  );
}

function AppListPanel({
  apps, loading, onOpen, onRefresh,
}: {
  apps: AppInfo[];
  loading: boolean;
  onOpen: (pkg: string) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = apps.filter(a =>
    a.appName.toLowerCase().includes(search.toLowerCase()) ||
    a.packageName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-list-panel">
      <div className="alp-toolbar">
        <div className="alp-count">{apps.length} apps installed</div>
        <button className="fb-btn" onClick={onRefresh} title="Refresh">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="fb-search-row">
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input className="fb-search" placeholder="Search apps..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="fb-loading"><RefreshCw size={24} className="spin" /><span>Loading apps...</span></div>
      ) : filtered.length === 0 ? (
        <div className="fb-empty"><AppWindow size={32} /><p>{search ? 'No apps found' : 'No apps loaded yet. Click Refresh.'}</p></div>
      ) : (
        <div className="app-grid">
          {filtered.map(app => (
            <button key={app.packageName} className="app-card" onClick={() => onOpen(app.packageName)}>
              <div className="app-card-icon"><AppWindow size={20} /></div>
              <div className="app-card-info">
                <span className="app-card-name">{app.appName}</span>
                <span className="app-card-pkg">{app.packageName}</span>
              </div>
              <Play size={14} className="app-card-play" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BatteryWidget({ level }: { level: number }) {
  const color = level > 50 ? '#22c55e' : level > 20 ? '#f59e0b' : '#ef4444';
  return (
    <div className="battery-widget">
      <div className="battery-shell">
        <div className="battery-fill" style={{ width: `${level}%`, background: color }} />
        <span className="battery-text">{level}%</span>
      </div>
      <div className="battery-tip" />
    </div>
  );
}

function StorageBar({ info }: { info: StorageInfo }) {
  const usedPct = info.totalBytes > 0 ? (info.usedBytes / info.totalBytes) * 100 : 0;
  return (
    <div className="storage-bar-wrap">
      <div className="storage-bar-track">
        <div className="storage-bar-fill" style={{ width: `${usedPct}%` }} />
      </div>
      <div className="storage-bar-labels">
        <span>{info.usedGB} GB used</span>
        <span>{info.freeGB} GB free</span>
        <span>{info.totalGB} GB total</span>
      </div>
    </div>
  );
}

function ScreenViewer({
  device, onClose, onSendCommand, streamActive, setStreamActive, latestFrame,
}: {
  device: Device;
  onClose: () => void;
  onSendCommand: (type: string, payload?: Record<string, unknown>) => void;
  streamActive: boolean;
  setStreamActive: (v: boolean) => void;
  latestFrame: string | null;
}) {
  const [tapX, setTapX] = useState('');
  const [tapY, setTapY] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);

  const startStream = () => { onSendCommand('START_STREAM'); setStreamActive(true); };
  const stopStream = () => { onSendCommand('STOP_STREAM'); setStreamActive(false); };

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const x = Math.round(xPct * 1080);
    const y = Math.round(yPct * 1920);
    onSendCommand('TAP', { x, y });
  };

  return (
    <div className="screen-viewer-overlay">
      <div className="screen-viewer">
        <div className="screen-viewer-header">
          <div className="screen-viewer-title">
            <Tv size={16} />
            <span>Live Screen: {device.device_name}</span>
            <span className={`status-dot ${latestFrame ? 'online' : 'offline'}`} />
            <span className="stream-state">{streamActive ? 'Streaming' : 'Stopped'}</span>
          </div>
          <div className="screen-viewer-actions">
            <button className="stream-action" onClick={startStream} disabled={streamActive}>Start</button>
            <button className="stream-action danger" onClick={stopStream} disabled={!streamActive}>Stop</button>
            <button className="screen-viewer-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="screen-viewer-body">
          <div className="screen-viewer-content">
            {latestFrame ? (
              <img ref={imgRef} src={`data:image/jpeg;base64,${latestFrame}`}
                alt="Device Screen" className="screen-frame" onClick={handleImgClick}
                title="Click to tap on device" />
            ) : (
              <div className="screen-viewer-placeholder">
                <Tv size={48} />
                <p>Waiting for screen stream...</p>
                <p className="screen-hint">
                  {device.status === 'ONLINE'
                    ? 'Device is online. Click Start to begin streaming.'
                    : 'Device is offline.'}
                </p>
                {!streamActive && (
                  <button className="btn-primary" onClick={startStream} style={{ marginTop: 16 }}>
                    <Tv size={14} style={{ marginRight: 6 }} />Start Stream
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="screen-controls-panel">
            <div className="sc-section-title">Touch Controls</div>
            <div className="sc-dpad">
              <button onClick={() => onSendCommand('SCROLL', { direction: 'up' })}><ChevronUp size={18} /></button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onSendCommand('SCROLL', { direction: 'left' })}><ChevronLeft size={18} /></button>
                <button onClick={() => onSendCommand('TAP', { x: 540, y: 960 })} title="Center tap">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor' }} />
                </button>
                <button onClick={() => onSendCommand('SCROLL', { direction: 'right' })}><ChevronRight size={18} /></button>
              </div>
              <button onClick={() => onSendCommand('SCROLL', { direction: 'down' })}><ChevronDown size={18} /></button>
            </div>
            <div className="sc-section-title" style={{ marginTop: 12 }}>Tap Coordinates</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="touch-input" type="number" placeholder="X" value={tapX}
                onChange={e => setTapX(e.target.value)} style={{ flex: 1 }} />
              <input className="touch-input" type="number" placeholder="Y" value={tapY}
                onChange={e => setTapY(e.target.value)} style={{ flex: 1 }} />
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: 6 }}
              onClick={() => { if (tapX && tapY) onSendCommand('TAP', { x: Number(tapX), y: Number(tapY) }); }}>
              Tap
            </button>
            <div className="sc-section-title" style={{ marginTop: 12 }}>Quick Actions</div>
            <button className="sc-quick-btn" onClick={() => onSendCommand('TAKE_SCREENSHOT')}>
              <Camera size={14} />Screenshot
            </button>
            <button className="sc-quick-btn" onClick={() => onSendCommand('DEVICE_INFO')}>
              <Info size={14} />Device Info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [controlMode, setControlMode] = useState<ControlMode>('HYBRID');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DashTab>('overview');

  const [tapX, setTapX] = useState('');
  const [tapY, setTapY] = useState('');
  const [inputText, setInputText] = useState('');
  const [filePath, setFilePath] = useState('/sdcard');
  const [packageName, setPackageName] = useState('');
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showScreenViewer, setShowScreenViewer] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [latestFrame, setLatestFrame] = useState<string | null>(null);

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [currentPath, setCurrentPath] = useState('/sdcard');
  const [filesLoading, setFilesLoading] = useState(false);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [deviceInfoData, setDeviceInfoData] = useState<DeviceInfo | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [pendingCommands, setPendingCommands] = useState<Set<string>>(new Set());

  const userEmail = api.getEmail() || 'User';
  const userId = api.getUserId() || '';
  const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
  const clientDevices = devices.filter(d => d.role === 'CLIENT');
  const isDeviceOnline = selectedDevice?.status === 'ONLINE';
  const unreadCount = notifications.filter(n => !n.read).length;

  const addLog = useCallback((type: LogEntry['type'], message: string, data?: unknown) => {
    setLogs(prev => [{
      id: Date.now().toString() + Math.random(), timestamp: new Date(), type, message, data,
    }, ...prev.slice(0, 199)]);
  }, []);

  const addNotification = useCallback((
    level: AppNotification['level'], title: string, message: string, deviceName?: string
  ) => {
    setNotifications(prev => [{
      id: Date.now().toString() + Math.random(), timestamp: new Date(),
      level, title, message, read: false, deviceName,
    }, ...prev.slice(0, 199)]);
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const result = await api.getDevices();
      setDevices(result);
    } catch (err) {
      addLog('error', `Failed to fetch devices: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, [addLog]);

  useEffect(() => {
    fetchDevices();
    api.subscribeToDevices(userId, updatedDevices => {
      setDevices(prev => {
        updatedDevices.forEach(d => {
          const old = prev.find(p => p.id === d.id);
          if (old && old.status !== d.status) {
            if (d.status === 'ONLINE')
              addNotification('success', 'Device Online', `${d.device_name} connected.`, d.device_name);
            else
              addNotification('warning', 'Device Offline', `${d.device_name} disconnected.`, d.device_name);
          }
        });
        return updatedDevices;
      });
    });

    api.subscribeToCommands(userId, (command: Command) => {
      const result = command.result as Record<string, unknown> | null;
      if (command.status === 'EXECUTED' && result) {
        setPendingCommands(prev => { const n = new Set(prev); n.delete(command.id); return n; });
        handleCommandResult(command.type, result);
        addLog('result', `${command.type} executed`, result);
      } else if (command.status === 'FAILED') {
        setPendingCommands(prev => { const n = new Set(prev); n.delete(command.id); return n; });
        addLog('error', `${command.type} failed: ${(result as Record<string,unknown>)?.error || 'Unknown error'}`);
        addNotification('error', 'Command Failed', `${command.type} failed.`);
      }
    });

    return () => api.unsubscribeAll();
  }, [fetchDevices, userId, addLog]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCommandResult = (type: string, result: Record<string, unknown>) => {
    const data = result.data as Record<string, unknown> | undefined;
    switch (type) {
      case 'GET_FILES': {
        const rawFiles = (data?.files as FileInfo[]) || [];
        const path = (data?.path as string) || '/sdcard';
        setFiles(rawFiles);
        setCurrentPath(path);
        setFilesLoading(false);
        setActiveTab('files');
        break;
      }
      case 'LIST_APPS': {
        const rawApps = (data?.apps as AppInfo[]) || [];
        setApps(rawApps);
        setAppsLoading(false);
        setActiveTab('apps');
        break;
      }
      case 'GET_BATTERY': {
        const level = data?.batteryLevel as number;
        if (typeof level === 'number') setBatteryLevel(level);
        setActiveTab('info');
        break;
      }
      case 'GET_STORAGE_INFO': {
        setStorageInfo(data as unknown as StorageInfo);
        setActiveTab('info');
        break;
      }
      case 'DEVICE_INFO': {
        setDeviceInfoData(data as unknown as DeviceInfo);
        setBatteryLevel((data?.batteryLevel as number) ?? null);
        setActiveTab('info');
        break;
      }
      case 'TAKE_SCREENSHOT': {
        const img = data?.image as string;
        if (img) { setLatestScreenshot(img); setActiveTab('screen'); }
        break;
      }
    }
  };

  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.id === selectedDevice.id);
      if (updated) setSelectedDevice(updated);
      else setSelectedDevice(null);
    }
  }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedDevice) return;
    const unsub = api.subscribeToScreenStream((frame: ArrayBuffer) => {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setLatestFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    });
    return () => { unsub(); };
  }, [selectedDevice?.device_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCommand = async (type: string, payload: Record<string, unknown> = {}) => {
    if (!selectedDevice) { addLog('error', 'No device selected'); return; }
    setLoading(true);
    addLog('command', `Sending ${type} to ${selectedDevice.device_name}`);
    try {
      const result = await api.sendCommand(selectedDevice.device_id, type, payload);
      setPendingCommands(prev => new Set([...prev, result.commandId]));
      addLog('info', `Command queued: ${type} (ID: ${result.commandId?.substring(0, 8) ?? '?'})`);
    } catch (err) {
      addLog('error', `Command failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  const navigateFiles = (path: string) => {
    setCurrentPath(path);
    setFilesLoading(true);
    sendCommand('GET_FILES', { path });
  };

  const refreshFiles = () => navigateFiles(currentPath);

  const refreshApps = () => {
    setAppsLoading(true);
    sendCommand('LIST_APPS');
  };

  const generatePairingCode = async () => {
    setPairingLoading(true);
    try {
      const code = await api.createPairingCode();
      setPairingCode(code);
      addLog('info', `Pairing code ${code.code} created. Expires in 15 minutes.`);
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

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearNotifications = () => setNotifications([]);

  const navItems: { id: DashTab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: 'overview', icon: <LayoutDashboard size={18} />, label: 'Overview' },
    { id: 'screen', icon: <Tv size={18} />, label: 'Screen' },
    { id: 'files', icon: <FolderOpen size={18} />, label: 'Files' },
    { id: 'apps', icon: <AppWindow size={18} />, label: 'Apps' },
    { id: 'control', icon: <Terminal size={18} />, label: 'Control' },
    { id: 'info', icon: <Info size={18} />, label: 'Device Info' },
    { id: 'notifications', icon: <Bell size={18} />, label: 'Alerts', badge: unreadCount },
    { id: 'log', icon: <Layers size={18} />, label: 'Log' },
  ];

  return (
    <div className="app-shell">
      <div className="app-bg">
        <div className="app-bg-orb app-bg-orb-1" />
        <div className="app-bg-orb app-bg-orb-2" />
        <div className="app-bg-orb app-bg-orb-3" />
      </div>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo"><Shield size={20} color="#000" /></div>
          <div>
            <div className="sidebar-title">HYBRID</div>
            <div className="sidebar-sub">CONTROL</div>
          </div>
        </div>

        <div className="sidebar-device-selector">
          <div className="sds-label">Active Device</div>
          {clientDevices.length === 0 ? (
            <div className="sds-empty">No devices paired</div>
          ) : (
            <div className="sds-list">
              {clientDevices.map(d => (
                <button
                  key={d.id}
                  className={`sds-item ${selectedDevice?.id === d.id ? 'active' : ''}`}
                  onClick={() => setSelectedDevice(d)}
                >
                  <span className={`status-dot-sm ${d.status === 'ONLINE' ? 'online' : 'offline'}`} />
                  <span className="sds-name">{d.device_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.id); if (item.id === 'notifications') markAllRead(); }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <User size={14} />
            <span className="sidebar-email">{userEmail}</span>
          </div>
          <button className="sidebar-logout" onClick={async () => { await api.logout(); onLogout(); }}>
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="page-title">Overview</div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon cyan"><Smartphone size={18} /></div>
                <div><span>Total Devices</span><strong>{devices.length}</strong></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><Radio size={18} /></div>
                <div><span>Online Now</span><strong>{onlineCount}</strong></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple"><Cpu size={18} /></div>
                <div><span>Clients</span><strong>{clientDevices.length}</strong></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon blue"><Clock3 size={18} /></div>
                <div>
                  <span>Selected</span>
                  <strong className="stat-small">{selectedDevice?.device_name || 'None'}</strong>
                </div>
              </div>
            </div>

            <div className="overview-grid">
              <div className="glass-card">
                <div className="card-header">
                  <span className="card-title">All Devices</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {onlineCount}/{devices.length} online
                  </span>
                </div>
                {devices.length === 0 ? (
                  <div className="empty-state">
                    <Smartphone size={40} />
                    <h3>No devices</h3>
                    <p>Install the Android agent and sign in</p>
                  </div>
                ) : (
                  <div className="device-list">
                    {devices.map(device => (
                      <div key={device.id}
                        className={`device-item ${selectedDevice?.id === device.id ? 'selected' : ''}`}
                        onClick={() => { setSelectedDevice(device); }}>
                        <div className="device-info">
                          <div className="device-icon">
                            <Smartphone size={22} color="var(--accent-cyan)" />
                          </div>
                          <div className="device-details">
                            <h3>{device.device_name}</h3>
                            <p>{device.model} · {device.os_version}</p>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              ID: {device.device_id}
                            </p>
                          </div>
                        </div>
                        <div className="device-meta">
                          <span className={`role-badge ${device.role.toLowerCase()}`}>{device.role}</span>
                          <span className={`status-badge ${device.status === 'ONLINE' ? 'online' : 'offline'}`}>
                            <span className={`status-dot ${device.status === 'ONLINE' ? 'online' : 'offline'}`} />
                            {device.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card">
                <div className="card-header">
                  <span className="card-title">Device Pairing</span>
                </div>
                <div className="pairing-panel">
                  <div className="pairing-icon"><KeyRound size={24} /></div>
                  <div className="pairing-copy">
                    <h3>Pair Android Client</h3>
                    <p>Generate a 6-digit code, then enter it in the Android agent during login.</p>
                  </div>
                  {pairingCode && (
                    <div className="pairing-code-row">
                      <div>
                        <span>Pairing code</span>
                        <strong>{pairingCode.code}</strong>
                        <small>Expires {new Date(pairingCode.expires_at).toLocaleTimeString()}</small>
                      </div>
                      <button className="btn-primary" onClick={copyPairingCode}>
                        <Copy size={14} style={{ marginRight: 4 }} />Copy
                      </button>
                    </div>
                  )}
                  <button className="btn-primary pairing-generate" onClick={generatePairingCode}
                    disabled={pairingLoading}>
                    {pairingLoading ? 'Generating...' : pairingCode ? 'New Code' : 'Generate Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'screen' && (
          <div className="tab-content">
            <div className="page-title">Screen & Stream</div>
            <div className="screen-tab-layout">
              <div className="glass-card screen-display-card">
                <div className="card-header">
                  <span className="card-title">
                    <Tv size={16} style={{ marginRight: 8 }} />Live Screen
                    <span className={`status-dot ${latestFrame ? 'online' : 'offline'}`}
                      style={{ marginLeft: 8 }} />
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="stream-action"
                      onClick={() => { sendCommand('START_STREAM'); setStreamActive(true); }}
                      disabled={!isDeviceOnline || streamActive}>
                      Start
                    </button>
                    <button className="stream-action danger"
                      onClick={() => { sendCommand('STOP_STREAM'); setStreamActive(false); setLatestFrame(null); }}
                      disabled={!streamActive}>
                      Stop
                    </button>
                  </div>
                </div>
                <div className="screen-display-area">
                  {latestFrame ? (
                    <img src={latestFrame}
                      alt="Live Screen" className="screen-frame-full"
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = Math.round(((e.clientX - rect.left) / rect.width) * 1080);
                        const y = Math.round(((e.clientY - rect.top) / rect.height) * 1920);
                        sendCommand('TAP', { x, y });
                      }}
                      title="Click to tap on device" />
                  ) : (
                    <div className="screen-viewer-placeholder" style={{ minHeight: 300 }}>
                      <Tv size={48} />
                      <p>Waiting for screen stream...</p>
                      <p className="screen-hint">
                        {selectedDevice
                          ? selectedDevice.status === 'ONLINE'
                            ? 'Device is online. Click Start to begin streaming.'
                            : 'Device is offline.'
                          : 'Select a device first.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="screen-sidebar-cards">
                <div className="glass-card">
                  <div className="card-header"><span className="card-title">Screenshot</span></div>
                  {latestScreenshot ? (
                    <div>
                      <img src={latestScreenshot}
                        alt="Screenshot" style={{ width: '100%', borderRadius: 8 }} />
                      <button className="btn-primary" style={{ width: '100%', marginTop: 8 }}
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = latestScreenshot!;
                          a.download = `screenshot-${Date.now()}.jpg`;
                          a.click();
                        }}>
                        <Download size={14} style={{ marginRight: 6 }} />Download
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '20px 0' }}>
                      <Camera size={28} />
                      <p>No screenshot yet</p>
                    </div>
                  )}
                  <button className="btn-primary" style={{ width: '100%', marginTop: 8 }}
                    onClick={() => sendCommand('TAKE_SCREENSHOT')}
                    disabled={!isDeviceOnline}>
                    <Camera size={14} style={{ marginRight: 6 }} />Take Screenshot
                  </button>
                </div>

                <div className="glass-card">
                  <div className="card-header"><span className="card-title">Touch Controls</span></div>
                  <div className="sc-dpad" style={{ margin: '12px auto' }}>
                    <button onClick={() => sendCommand('SCROLL', { direction: 'up' })}><ChevronUp size={18} /></button>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => sendCommand('SCROLL', { direction: 'left' })}><ChevronLeft size={18} /></button>
                      <button onClick={() => sendCommand('TAP', { x: 540, y: 960 })}>
                        <Eye size={14} />
                      </button>
                      <button onClick={() => sendCommand('SCROLL', { direction: 'right' })}><ChevronRight size={18} /></button>
                    </div>
                    <button onClick={() => sendCommand('SCROLL', { direction: 'down' })}><ChevronDown size={18} /></button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="touch-input" type="number" placeholder="X" value={tapX}
                      onChange={e => setTapX(e.target.value)} style={{ flex: 1 }} />
                    <input className="touch-input" type="number" placeholder="Y" value={tapY}
                      onChange={e => setTapY(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn-primary"
                      onClick={() => { if (tapX && tapY) sendCommand('TAP', { x: Number(tapX), y: Number(tapY) }); }}>
                      Tap
                    </button>
                  </div>
                  <div className="touch-input-row" style={{ marginTop: 8 }}>
                    <input className="touch-input" placeholder="Text to type..."
                      value={inputText} onChange={e => setInputText(e.target.value)} />
                    <button className="btn-primary"
                      onClick={() => { if (inputText) sendCommand('INPUT_TEXT', { text: inputText }); }}
                      disabled={!inputText}>
                      <Type size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="tab-content">
            <div className="page-header-row">
              <div className="page-title">File Browser</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['/sdcard', '/sdcard/Download', '/sdcard/DCIM', '/sdcard/Documents'].map(p => (
                  <button key={p} className="quick-path-btn" onClick={() => navigateFiles(p)}
                    disabled={!isDeviceOnline}>
                    {p.split('/').pop()}
                  </button>
                ))}
              </div>
            </div>
            {!selectedDevice ? (
              <div className="glass-card">
                <div className="empty-state"><FolderOpen size={40} /><h3>Select a device</h3></div>
              </div>
            ) : !isDeviceOnline ? (
              <div className="glass-card">
                <div className="empty-state"><FolderOpen size={40} /><h3>Device is offline</h3></div>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <FileBrowserPanel
                  files={files}
                  currentPath={currentPath}
                  loading={filesLoading}
                  onNavigate={navigateFiles}
                  onDelete={(path) => {
                    if (confirm(`Delete ${path}?`)) sendCommand('DELETE_FILE', { path });
                  }}
                  onRefresh={refreshFiles}
                />
              </div>
            )}
            {files.length === 0 && isDeviceOnline && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <button className="btn-primary"
                  onClick={() => navigateFiles('/sdcard')}>
                  <FolderOpen size={14} style={{ marginRight: 6 }} />Load /sdcard
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'apps' && (
          <div className="tab-content">
            <div className="page-title">Installed Apps</div>
            {!selectedDevice ? (
              <div className="glass-card">
                <div className="empty-state"><AppWindow size={40} /><h3>Select a device</h3></div>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <AppListPanel
                  apps={apps}
                  loading={appsLoading}
                  onOpen={(pkg) => sendCommand('OPEN_APP', { packageName: pkg })}
                  onRefresh={refreshApps}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'control' && (
          <div className="tab-content">
            <div className="page-title">Command Control</div>
            <div className="control-grid">
              <div className="glass-card">
                <div className="card-header">
                  <span className="card-title">Quick Commands</span>
                  {selectedDevice && (
                    <span style={{ fontSize: 12, color: 'var(--accent-cyan)' }}>
                      {selectedDevice.device_name}
                    </span>
                  )}
                </div>
                {!selectedDevice ? (
                  <div className="empty-state"><Monitor size={40} /><h3>Select a device</h3></div>
                ) : (
                  <>
                    <div className="command-grid">
                      {[
                        { type: 'DEVICE_INFO', icon: <Info size={20} />, label: 'Device Info' },
                        { type: 'TAKE_SCREENSHOT', icon: <Camera size={20} />, label: 'Screenshot' },
                        { type: 'LIST_APPS', icon: <AppWindow size={20} />, label: 'List Apps' },
                        { type: 'GET_BATTERY', icon: <Battery size={20} />, label: 'Battery' },
                        { type: 'GET_STORAGE_INFO', icon: <HardDrive size={20} />, label: 'Storage' },
                        { type: 'GET_FILES', icon: <FolderOpen size={20} />, label: 'Files', payload: { path: '/sdcard' } },
                      ].map(cmd => (
                        <button key={cmd.type} className="command-btn"
                          onClick={() => sendCommand(cmd.type, cmd.payload || {})}
                          disabled={loading || !isDeviceOnline}>
                          {cmd.icon}{cmd.label}
                          {pendingCommands.size > 0 && (
                            <span className="cmd-pending-dot" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="control-section">
                      <div className="control-section-title">Open App</div>
                      <div className="touch-input-row">
                        <input className="touch-input" placeholder="Package name (e.g. com.android.chrome)"
                          value={packageName} onChange={e => setPackageName(e.target.value)} />
                        <button className="btn-primary"
                          onClick={() => { if (packageName) sendCommand('OPEN_APP', { packageName }); }}
                          disabled={loading || !isDeviceOnline || !packageName}>
                          <Play size={14} style={{ marginRight: 4 }} />Open
                        </button>
                      </div>
                    </div>

                    <div className="control-section">
                      <div className="control-section-title">Browse Files</div>
                      <div className="touch-input-row">
                        <input className="touch-input" placeholder="Path (e.g. /sdcard/Download)"
                          value={filePath} onChange={e => setFilePath(e.target.value)} />
                        <button className="btn-primary"
                          onClick={() => navigateFiles(filePath || '/sdcard')}
                          disabled={loading || !isDeviceOnline}>
                          <FolderOpen size={14} />
                        </button>
                        <button className="btn-primary"
                          onClick={() => { if (filePath && confirm(`Delete ${filePath}?`)) sendCommand('DELETE_FILE', { path: filePath }); }}
                          disabled={loading || !isDeviceOnline || !filePath}
                          style={{ background: 'var(--accent-red)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="glass-card">
                <div className="card-header"><span className="card-title">Control Mode</span></div>
                <div className="mode-selector">
                  {(['COMMAND', 'TOUCH', 'HYBRID'] as ControlMode[]).map(mode => (
                    <button key={mode} className={`mode-btn ${controlMode === mode ? 'active' : ''}`}
                      onClick={() => setControlMode(mode)}>
                      {mode === 'COMMAND' && <Zap size={14} style={{ marginRight: 4 }} />}
                      {mode === 'TOUCH' && <MousePointer size={14} style={{ marginRight: 4 }} />}
                      {mode === 'HYBRID' && <Settings size={14} style={{ marginRight: 4 }} />}
                      {mode}
                    </button>
                  ))}
                </div>

                {(controlMode === 'TOUCH' || controlMode === 'HYBRID') && selectedDevice && (
                  <div className="touch-panel" style={{ marginTop: 16 }}>
                    <div className="sc-dpad">
                      <button onClick={() => sendCommand('SCROLL', { direction: 'up' })}><ChevronUp size={18} /></button>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => sendCommand('SCROLL', { direction: 'left' })}><ChevronLeft size={18} /></button>
                        <button style={{ width: 36 }} onClick={() => sendCommand('TAP', { x: 540, y: 960 })}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', margin: 'auto' }} />
                        </button>
                        <button onClick={() => sendCommand('SCROLL', { direction: 'right' })}><ChevronRight size={18} /></button>
                      </div>
                      <button onClick={() => sendCommand('SCROLL', { direction: 'down' })}><ChevronDown size={18} /></button>
                    </div>
                    <div className="touch-input-row" style={{ marginTop: 12 }}>
                      <input className="touch-input" type="number" placeholder="X" value={tapX} onChange={e => setTapX(e.target.value)} />
                      <input className="touch-input" type="number" placeholder="Y" value={tapY} onChange={e => setTapY(e.target.value)} />
                      <button className="btn-primary"
                        onClick={() => { if (tapX && tapY) sendCommand('TAP', { x: Number(tapX), y: Number(tapY) }); }}
                        disabled={loading || !isDeviceOnline || !tapX || !tapY}>Tap</button>
                    </div>
                    <div className="touch-input-row" style={{ marginTop: 8 }}>
                      <input className="touch-input" placeholder="Type text..."
                        value={inputText} onChange={e => setInputText(e.target.value)} />
                      <button className="btn-primary"
                        onClick={() => { if (inputText) sendCommand('INPUT_TEXT', { text: inputText }); }}
                        disabled={loading || !isDeviceOnline || !inputText}>
                        <Type size={14} />
                      </button>
                    </div>
                    <div className="touch-input-row" style={{ marginTop: 8 }}>
                      {['up', 'down', 'left', 'right'].map(dir => (
                        <button key={dir} className="btn-primary" style={{ flex: 1 }}
                          onClick={() => sendCommand('SCROLL', { direction: dir })}
                          disabled={loading || !isDeviceOnline}>
                          {dir}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="tab-content">
            <div className="page-header-row">
              <div className="page-title">Device Info</div>
              {selectedDevice && isDeviceOnline && (
                <button className="btn-primary" onClick={() => sendCommand('DEVICE_INFO')}>
                  <RefreshCw size={14} style={{ marginRight: 6 }} />Refresh All
                </button>
              )}
            </div>
            <div className="info-grid">
              <div className="glass-card">
                <div className="card-header"><span className="card-title"><Battery size={15} style={{ marginRight: 8 }} />Battery</span>
                  {isDeviceOnline && <button className="refresh-btn" onClick={() => sendCommand('GET_BATTERY')}><RefreshCw size={12} /></button>}
                </div>
                {batteryLevel !== null ? (
                  <div style={{ padding: '16px 0' }}>
                    <BatteryWidget level={batteryLevel} />
                    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 28, fontWeight: 700, color: batteryLevel > 50 ? '#22c55e' : batteryLevel > 20 ? '#f59e0b' : '#ef4444' }}>
                      {batteryLevel}%
                    </div>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <Battery size={32} />
                    <p>Click Refresh</p>
                  </div>
                )}
              </div>

              <div className="glass-card">
                <div className="card-header"><span className="card-title"><HardDrive size={15} style={{ marginRight: 8 }} />Storage</span>
                  {isDeviceOnline && <button className="refresh-btn" onClick={() => sendCommand('GET_STORAGE_INFO')}><RefreshCw size={12} /></button>}
                </div>
                {storageInfo ? (
                  <div style={{ padding: '16px 0' }}>
                    <StorageBar info={storageInfo} />
                    <div className="storage-details">
                      <div className="storage-detail-item">
                        <span>Total</span><strong>{storageInfo.totalGB} GB</strong>
                      </div>
                      <div className="storage-detail-item">
                        <span>Used</span><strong>{storageInfo.usedGB} GB</strong>
                      </div>
                      <div className="storage-detail-item">
                        <span>Free</span><strong>{storageInfo.freeGB} GB</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <HardDrive size={32} /><p>Click Refresh</p>
                  </div>
                )}
              </div>

              <div className="glass-card info-card-full">
                <div className="card-header"><span className="card-title"><Smartphone size={15} style={{ marginRight: 8 }} />Device Details</span>
                  {isDeviceOnline && <button className="refresh-btn" onClick={() => sendCommand('DEVICE_INFO')}><RefreshCw size={12} /></button>}
                </div>
                {deviceInfoData ? (
                  <div className="device-info-table">
                    {[
                      ['Device Name', deviceInfoData.deviceName],
                      ['Model', deviceInfoData.model],
                      ['Manufacturer', deviceInfoData.manufacturer],
                      ['OS Version', deviceInfoData.osVersion],
                      ['SDK Version', String(deviceInfoData.sdkVersion)],
                      ['Device ID', deviceInfoData.deviceId],
                      ['Battery', `${deviceInfoData.batteryLevel}%`],
                      ['Screen', deviceInfoData.isScreenOn ? 'On' : 'Off'],
                    ].map(([label, value]) => (
                      <div key={label} className="di-row">
                        <span className="di-label">{label}</span>
                        <span className="di-value">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : selectedDevice ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <Info size={32} /><p>Click Refresh to load device details</p>
                    <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => sendCommand('DEVICE_INFO')} disabled={!isDeviceOnline}>
                      Load Info
                    </button>
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <Info size={32} /><p>Select a device</p>
                  </div>
                )}
              </div>

              {selectedDevice && (
                <div className="glass-card info-card-full">
                  <div className="card-header"><span className="card-title"><Wifi size={15} style={{ marginRight: 8 }} />Connection Info</span></div>
                  <div className="device-info-table">
                    {[
                      ['Device UUID', selectedDevice.id],
                      ['Device ID', selectedDevice.device_id],
                      ['Role', selectedDevice.role],
                      ['Status', selectedDevice.status],
                      ['Last Seen', new Date(selectedDevice.last_seen).toLocaleString()],
                      ['Joined', new Date(selectedDevice.created_at).toLocaleString()],
                    ].map(([label, value]) => (
                      <div key={label} className="di-row">
                        <span className="di-label">{label}</span>
                        <span className="di-value" style={{ wordBreak: 'break-all', fontSize: 11 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="tab-content">
            <div className="page-header-row">
              <div className="page-title">Alerts & Notifications</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {notifications.length > 0 && (
                  <>
                    <button className="notif-action-btn" onClick={markAllRead}>
                      <CheckCheck size={14} style={{ marginRight: 4 }} />Mark read
                    </button>
                    <button className="notif-action-btn danger" onClick={clearNotifications}>
                      <X size={14} style={{ marginRight: 4 }} />Clear all
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="glass-card">
              {notifications.length === 0 ? (
                <div className="empty-state">
                  <Bell size={40} /><h3>No notifications</h3>
                  <p>Alerts appear here when devices connect or commands execute.</p>
                </div>
              ) : (
                <div className="notif-list">
                  {notifications.map(notif => (
                    <div key={notif.id}
                      className={`notif-item ${notif.level} ${notif.read ? 'read' : 'unread'}`}
                      onClick={() => setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))}>
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
                              <Smartphone size={11} style={{ marginRight: 3 }} />{notif.deviceName}
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

        {activeTab === 'log' && (
          <div className="tab-content">
            <div className="page-header-row">
              <div className="page-title">Activity Log</div>
              <button className="notif-action-btn danger" onClick={() => setLogs([])}>
                <X size={14} style={{ marginRight: 4 }} />Clear
              </button>
            </div>
            <div className="glass-card">
              {logs.length === 0 ? (
                <div className="empty-state"><Wifi size={32} /><p>No activity yet</p></div>
              ) : (
                <div className="log-container">
                  {logs.map(log => (
                    <div key={log.id} className={`log-entry ${log.type}`}>
                      <span className="log-time">{log.timestamp.toLocaleTimeString()}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showScreenViewer && selectedDevice && (
        <ScreenViewer device={selectedDevice} onClose={() => setShowScreenViewer(false)}
          onSendCommand={(type, payload = {}) => sendCommand(type, payload)}
          streamActive={streamActive} setStreamActive={setStreamActive}
          latestFrame={latestFrame} />
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
          <div className="login-logo"><Shield size={32} color="#000" /></div>
          <div className="login-title">HYBRID CONTROL</div>
          <div className="login-sub">Configuration Required</div>
        </div>
        <div className="error-msg" style={{ textAlign: 'left', lineHeight: 1.6 }}>
          <strong>Supabase credentials are not set.</strong><br /><br />
          Please add:<br />
          <code style={{ display: 'block', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
            VITE_SUPABASE_URL<br />VITE_SUPABASE_ANON_KEY
          </code>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const [session, setSession] = useState<null | import('@supabase/supabase-js').Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div className="login-page">
      <div className="app-bg"><div className="app-bg-orb app-bg-orb-1" /><div className="app-bg-orb app-bg-orb-2" /></div>
      <div style={{ color: '#fff', fontSize: 18 }}>Loading...</div>
    </div>
  );

  return session ? (
    <Dashboard session={session} onLogout={() => setSession(null)} />
  ) : (
    <LoginPage onLogin={() => supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))} />
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigurationRequired />;
  return <AppContent />;
}
