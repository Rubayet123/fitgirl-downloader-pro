import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardPaste,
  Download,
  Settings as SettingsIcon,
  Search,
  Plus,
  X,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clipboard,
  Check,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Monitor,
  FolderOpen,
  Palette,
  Bell,
  Activity,
  History,
  Info,
  HelpCircle,
  Github,
  Mail,
  Heart
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FFLink, QueueItem, QueueItemState, Settings } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'paste' | 'downloads' | 'settings' | 'info'>('paste');
  const [inputUrl, setInputUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scrapedLinks, setScrapedLinks] = useState<FFLink[]>([]);
  const [scrapedTitle, setScrapedTitle] = useState<string>('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    download_folder: 'C:/Downloads/FitGirl',
    max_connections: 8,
    resume_on_start: true,
    accent_color: '#6C63FF',
    theme: 'dark',
    game_specific_folders: true,
    notifications_enabled: true
  });
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: 'success' | 'error' | 'info' }[]>([]);

  const THEME_ACCENTS: Record<string, string> = {
    'dark': '#6C63FF',
    'oled': '#6C63FF',
    'legacy': '#38b000',
    'nordic': '#88c0d0',
    'cyberpunk': '#00ff00',
    'dracula': '#bd93f9',
    'macos-light': '#007aff',
    'macos-dark': '#007aff',
    'windows-light': '#0078d4',
    'windows-dark': '#0078d4'
  };

  const updateTheme = (newTheme: typeof settings.theme) => {
    setSettings(prev => ({
      ...prev,
      theme: newTheme,
      accent_color: THEME_ACCENTS[newTheme] || prev.accent_color
    }));
    setThemeDropdownOpen(false);
  };

  const addToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const isValidFitGirlUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        (parsed.hostname === 'fitgirl-repacks.site' || parsed.hostname.endsWith('.fitgirl-repacks.site'));
    } catch {
      return false;
    }
  };

  // Theme & Notifications effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);

    // Apply dynamic accent color
    const root = document.documentElement;
    const isValidHex = /^#?([0-9A-F]{3}){1,2}$/i.test(settings.accent_color);

    if (isValidHex) {
      root.style.setProperty('--dynamic-accent', settings.accent_color);

      // Calculate hover color (slightly brighter/darker)
      const darken = (hex: string, percent: number) => {
        try {
          const num = parseInt(hex.replace('#', ''), 16);
          const amt = Math.round(2.55 * percent);
          const R = (num >> 16) + amt;
          const G = (num >> 8 & 0x00FF) + amt;
          const B = (num & 0x0000FF) + amt;
          return '#' + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
        } catch {
          return hex;
        }
      };
      root.style.setProperty('--dynamic-accent-hover', darken(settings.accent_color, 10));
    }

    if (settings.notifications_enabled && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [settings.theme, settings.notifications_enabled, settings.accent_color]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setQueue((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleScrape = async () => {
    if (!inputUrl) return;

    if (!isValidFitGirlUrl(inputUrl)) {
      addToast('Please enter a valid FitGirl Repacks URL', 'error');
      return;
    }

    setIsScraping(true);
    try {
      const data: any = await invoke('scrape_game_links', { url: inputUrl });
      setScrapedLinks(data.links);
      setScrapedTitle(data.title);
      addToast(`Found ${data.links.length} links for ${data.title}`, 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsScraping(false);
    }
  };

  const addToQueue = (link: FFLink) => {
    if (queue.find(q => q.ff_url === link.ff_url)) {
      addToast('Already in queue', 'info');
      return;
    }

    const downloadPath = settings.game_specific_folders && scrapedTitle
      ? `${settings.download_folder}/${scrapedTitle.replace(/[:*?"<>|]/g, '')}`
      : settings.download_folder;

    const newItem: QueueItem = {
      id: uuidv4(),
      label: scrapedTitle ? `${scrapedTitle} - ${link.label}` : link.label,
      ff_url: link.ff_url,
      cdn_url: '',
      state: 'waiting',
      filename: link.label.replace(/[^a-z0-9.]/gi, '_') + '.rar',
      progress: 0,
      downloaded: 0,
      totalSize: parseSize(link.file_size),
      speed: 0,
      eta: 0
    };
    setQueue(prev => [...prev, newItem]);
    addToast(`${link.label} added to queue`, 'success');
  };

  const addAllToQueue = () => {
    const downloadPath = settings.game_specific_folders && scrapedTitle
      ? `${settings.download_folder}/${scrapedTitle.replace(/[:*?"<>|]/g, '')}`
      : settings.download_folder;

    const newItems = scrapedLinks
      .filter(link => !queue.find(q => q.ff_url === link.ff_url))
      .map(link => ({
        id: uuidv4(),
        label: scrapedTitle ? `${scrapedTitle} - ${link.label}` : link.label,
        ff_url: link.ff_url,
        cdn_url: '',
        state: 'waiting' as const,
        filename: link.label.replace(/[^a-z0-9.]/gi, '_') + '.rar',
        progress: 0,
        downloaded: 0,
        totalSize: parseSize(link.file_size),
        speed: 0,
        eta: 0
      }));
    setQueue(prev => [...prev, ...newItems]);
    addToast(`Added ${newItems.length} items to queue`, 'success');
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      addToast('Link copied to clipboard', 'success');
    } catch (err) {
      addToast('Failed to copy link', 'error');
    }
  };

  const handleCopyAllLinks = async () => {
    try {
      const allLinks = scrapedLinks.map(l => l.ff_url).join('\n');
      await navigator.clipboard.writeText(allLinks);
      addToast('All links copied to clipboard', 'success');
    } catch (err) {
      addToast('Failed to copy links', 'error');
    }
  };

  const parseSize = (sizeStr: string) => {
    const val = parseFloat(sizeStr);
    if (sizeStr.includes('GB')) return val * 1024 * 1024 * 1024;
    if (sizeStr.includes('MB')) return val * 1024 * 1024;
    return 0;
  };

  // Queue Manager Effect - Strictly Sequential
  useEffect(() => {
    // Find the first item that isn't finished
    const firstIncompleteItem = queue.find(q => q.state !== 'completed');

    // Only auto-start if the first incomplete item is 'waiting'
    if (firstIncompleteItem && firstIncompleteItem.state === 'waiting') {
      startDownload(firstIncompleteItem.id);
    }
  }, [queue]);

  // Real Download Event Listeners
  useEffect(() => {
    const unlistenProgress = listen('download-progress', (event: any) => {
      const { id, downloaded, total_size, speed } = event.payload;
      setQueue(prev => prev.map(q => q.id === id ? {
        ...q,
        downloaded,
        totalSize: total_size,
        progress: (downloaded / total_size) * 100,
        speed,
        eta: speed > 0 ? (total_size - downloaded) / speed : 0
      } : q));
    });

    const unlistenComplete = listen('download-complete', (event: any) => {
      const id = event.payload;
      setQueue(prev => prev.map(q => q.id === id ? {
        ...q,
        state: 'completed',
        progress: 100,
        speed: 0
      } : q));
      
      if (settings.notifications_enabled && Notification.permission === 'granted') {
        new Notification('Download Complete', {
          body: `File download finished.`,
          icon: '/download-icon.png'
        });
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
    };
  }, [settings.notifications_enabled]);

  const startDownload = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;

    setQueue(prev => prev.map(q => q.id === id ? { ...q, state: 'resolving', error_message: '' } : q));

    try {
      // 1. Resolve the real CDN link
      let cdnUrl = item.cdn_url;
      if (!cdnUrl) {
        cdnUrl = await invoke('resolve_cdn_url', { ffUrl: item.ff_url });
        setQueue(prev => prev.map(q => q.id === id ? { ...q, cdn_url: cdnUrl } : q));
      }

      // 2. Start the real download
      setQueue(prev => prev.map(q => q.id === id ? { ...q, state: 'downloading', startTime: Date.now() } : q));
      
      const downloadPath = `${settings.download_folder}/${item.filename}`;
      
      await invoke('download_file', {
        id,
        url: cdnUrl,
        path: downloadPath
      });

    } catch (err: any) {
      console.error('Download error:', err);
      setQueue(prev => prev.map(q => q.id === id ? { ...q, state: 'failed', error_message: err.message || 'Error occurred' } : q));
      addToast(`Download failed: ${err.message || err}`, 'error');
    }
  };

  const retryDownload = (id: string) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, state: 'waiting', error_message: '' } : q));
    addToast('Retrying download...', 'info');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedText = e.dataTransfer.getData('text/plain');
    if (droppedText && isValidFitGirlUrl(droppedText)) {
      setInputUrl(droppedText);
      addToast('URL detected via drop', 'info');
      // Use the value directly as state update might be async
      setIsScraping(true);
      try {
        const data: any = await invoke('scrape_game_links', { url: droppedText });
        setScrapedLinks(data.links);
        setScrapedTitle(data.title);
        addToast(`Found ${data.links.length} links`, 'success');
      } catch (err: any) {
        addToast(err.message, 'error');
      } finally {
        setIsScraping(false);
      }
    } else if (droppedText) {
      addToast('Invalid FitGirl URL dropped', 'error');
    }
  };

  // Simulation removed as real downloader is now active

  const clearCompleted = () => {
    const completedCount = queue.filter(q => q.state === 'completed').length;
    if (completedCount === 0) return;

    setQueue(prev => prev.filter(q => q.state !== 'completed'));
    addToast(`Cleared ${completedCount} completed downloads`, 'info');
  };

  const handleOpenFolder = async (filename?: string) => {
    try {
      const path = filename 
        ? `${settings.download_folder}/${filename}`
        : settings.download_folder;
      await invoke('open_folder', { path });
    } catch (err: any) {
      addToast(`Could not open folder: ${err.message || err}`, 'error');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    return formatSize(bytesPerSec) + '/s';
  };

  const formatEta = (seconds: number) => {
    if (seconds <= 0 || !isFinite(seconds)) return 'Calculating...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
  };

  const formatElapsed = (startTime?: number) => {
    if (!startTime) return '00:00:00';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-bg-base text-text-primary overflow-hidden select-none">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-16 flex flex-col items-center py-6 bg-bg-surface border-r border-border-subtle z-50">
          <div className="mb-10 w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <Download className="text-white w-6 h-6" />
          </div>

          <nav className="flex flex-col gap-4 flex-1">
            <SidebarButton
              icon={ClipboardPaste}
              active={activeTab === 'paste'}
              onClick={() => setActiveTab('paste')}
              label="Quick Paste"
            />
            <SidebarButton
              icon={Download}
              active={activeTab === 'downloads'}
              onClick={() => setActiveTab('downloads')}
              label="Downloads"
            />
          </nav>

          <div className="mt-auto space-y-4">
            <SidebarButton
              icon={Info}
              active={activeTab === 'info'}
              onClick={() => setActiveTab('info')}
              label="About"
            />
            <SidebarButton
              icon={SettingsIcon}
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              label="Settings"
            />
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto relative h-full">
          <header className="sticky top-0 z-40 bg-bg-base/95 backdrop-blur-md px-6 py-4 border-b border-border-subtle flex justify-between items-center group/header">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight uppercase">FitGirl Downloader Pro</h1>
                <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[9px] font-black uppercase">v1.0.4</span>
              </div>
              <p className="text-text-muted text-[10px] font-medium tracking-wide">Secure High-Speed Mirror Downloader</p>
            </div>

            <div className="flex items-center gap-6">
              {activeTab === 'downloads' && (
                <div className="hidden md:flex gap-4 items-center text-[11px] font-bold text-text-muted border-r border-border-subtle pr-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    <span>{formatSpeed(queue.reduce((acc, q) => acc + q.speed, 0))}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-3 h-3" />
                    <span>{queue.filter(q => q.state === 'waiting').length} QUEUED</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-0">
                {settings.theme.startsWith('macos') ? (
                  <div className="flex items-center gap-2 px-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                    <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840] border border-black/5 hover:brightness-90 transition-all cursor-default" />
                  </div>
                ) : (
                  <>
                    <div className="w-10 h-10 flex items-center justify-center hover:bg-white/5 transition-colors cursor-default group/btn">
                      <div className="w-3 h-[1px] bg-text-muted group-hover/btn:bg-text-primary" />
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center hover:bg-white/5 transition-colors cursor-default group/btn">
                      <div className="w-3 h-3 border border-text-muted group-hover/btn:bg-text-primary" />
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center hover:bg-danger transition-colors cursor-default group/btn">
                      <X className="w-4 h-4 text-text-muted group-hover/btn:text-white" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="p-8 max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'paste' && (
                <motion.div
                  key="paste"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn(
                    "space-y-8 min-h-[400px] transition-colors rounded-app p-4",
                    isDragging && "bg-accent/5 ring-2 ring-accent ring-dashed"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Quick Paste</h2>
                    <p className="text-text-muted">Paste a FitGirl game page URL to extract fast links.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="relative flex-1 group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-accent transition-colors">
                          <Search className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          placeholder="https://fitgirl-repacks.site/game-name/"
                          value={inputUrl}
                          onChange={(e) => setInputUrl(e.target.value)}
                          className={cn(
                            "w-full bg-bg-raised border rounded-app py-3 pl-11 pr-4 focus:outline-none transition-all",
                            inputUrl && !isValidFitGirlUrl(inputUrl)
                              ? "border-danger focus:ring-1 focus:ring-danger"
                              : "border-border-subtle focus:border-accent focus:ring-1 focus:ring-accent"
                          )}
                        />
                      </div>
                      <button
                        onClick={handleScrape}
                        disabled={isScraping || !inputUrl || !isValidFitGirlUrl(inputUrl)}
                        className={cn(
                          "inline-flex items-center justify-center gap-2 bg-accent text-white px-8 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.1em] transition-all shadow-lg shadow-accent/25",
                          "hover:opacity-95 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:scale-100"
                        )}
                      >
                        {isScraping ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <ClipboardPaste className="w-3.5 h-3.5" />
                            <span>Extract</span>
                          </>
                        )}
                      </button>
                    </div>
                    {inputUrl && !isValidFitGirlUrl(inputUrl) && (
                      <p className="text-xs text-danger font-medium flex items-center gap-1.5 ml-4">
                        <AlertCircle className="w-3 h-3" />
                        Not a valid FitGirl URL
                      </p>
                    )}
                  </div>

                  {scrapedLinks.length > 0 ? (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center bg-bg-surface p-4 rounded-app border border-border-subtle">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold truncate max-w-xs">{scrapedTitle}</span>
                          <span className="text-xs text-text-muted">{scrapedLinks.length} FuckingFast links detected</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={handleCopyAllLinks}
                            className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-accent flex items-center gap-1.5 transition-colors"
                          >
                            <Clipboard className="w-3 h-3" />
                            Copy All
                          </button>
                          <button
                            onClick={addAllToQueue}
                            className="text-[10px] font-black uppercase tracking-widest text-accent hover:text-accent-hover flex items-center gap-1.5 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Add All to Queue
                          </button>
                        </div>
                      </div>

                      {/* Missing Part Guard */}
                      {(() => {
                        const partNumbers = scrapedLinks.map(l => l.part_number).filter(n => n > 0).sort((a, b) => a - b);
                        const missingParts = [];
                        if (partNumbers.length > 0) {
                          for (let i = 1; i < Math.max(...partNumbers); i++) {
                            if (!partNumbers.includes(i)) missingParts.push(i);
                          }
                        }
                        return missingParts.length > 0 && (
                          <div className="bg-warning/10 border border-warning/30 rounded-app p-3 flex items-center gap-3 text-warning">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <p className="text-xs font-semibold">
                              Warning: Missing parts detected in series ({missingParts.join(', ')}). Check the source page.
                            </p>
                          </div>
                        );
                      })()}

                      <div className="grid gap-3">
                        {scrapedLinks.map((link, idx) => {
                          const inQueue = queue.find(q => q.ff_url === link.ff_url);
                          return (
                            <div key={idx} className="glass rounded-app p-4 flex items-center justify-between group hover:border-accent/40 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-bg-raised flex items-center justify-center text-text-muted group-hover:text-accent transition-colors">
                                  <span className="text-xs font-bold">{link.part_number || idx + 1}</span>
                                </div>
                                <div>
                                  <h4 className="font-semibold">{link.label}</h4>
                                  <p className="text-text-muted text-xs">{link.file_size || 'Unknown size'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleCopyLink(link.ff_url)}
                                  title="Copy Link"
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-bg-raised border border-border-subtle hover:border-accent hover:text-accent transition-all group/copy"
                                >
                                  <Clipboard className="w-4 h-4 transition-transform group-active/copy:scale-90" />
                                </button>
                                <button
                                  onClick={() => addToQueue(link)}
                                  disabled={!!inQueue}
                                  className={cn(
                                    "text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-accent/10 h-9 flex items-center",
                                    inQueue
                                      ? "bg-success/10 text-success border border-success/20 cursor-default shadow-none"
                                      : "bg-accent text-white hover:opacity-90 active:scale-95"
                                  )}
                                >
                                  {inQueue ? (
                                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Added</span>
                                  ) : (
                                    'Add to Queue'
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    !isScraping && inputUrl && (
                      <div className="bg-bg-raised/50 border border-border-subtle border-dashed p-10 rounded-app flex flex-col items-center justify-center text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-bg-raised flex items-center justify-center">
                          <AlertCircle className="w-6 h-6 text-text-muted" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">No FuckingFast links found</p>
                          <p className="text-xs text-text-muted max-w-[280px]">Make sure the page has direct download mirrors for FuckingFast. Some repacks may only have torrents or other filehosters.</p>
                        </div>
                      </div>
                    )
                  )}
                </motion.div>
              )}

              {activeTab === 'downloads' && (
                <motion.div
                  key="downloads"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  {/* Active Section */}
                  {queue.some(q => q.state === 'downloading' || q.state === 'resolving') && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Active Download</h3>
                      {queue.filter(q => q.state === 'downloading' || q.state === 'resolving').map(item => (
                        <div key={item.id} className="bg-bg-surface border border-accent/30 rounded-app p-6 space-y-4 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-accent" />
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <h4 className="text-lg font-bold">{item.label}</h4>
                              <p className="text-text-muted text-xs flex items-center gap-2 truncate max-w-md">
                                <ExternalLink className="w-3 h-3" />
                                {item.ff_url}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, state: 'paused' } : q))}
                                className="w-9 h-9 rounded-md bg-bg-raised border border-border-subtle flex items-center justify-center hover:text-accent transition-colors"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                                className="w-9 h-9 rounded-md bg-bg-raised border border-border-subtle flex items-center justify-center hover:text-danger transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-accent">{item.state === 'resolving' ? 'Resolving link...' : `${Math.floor(item.progress)}% Completed`}</span>
                              <span className="text-text-muted">{formatSize(item.downloaded)} / {formatSize(item.totalSize)}</span>
                            </div>
                            <div className="h-2 w-full bg-bg-raised rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-accent"
                                initial={{ width: 0 }}
                                animate={{ width: `${item.progress}%` }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 py-4 border-t border-border-subtle/50">
                            <div className="space-y-1">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Current Speed</p>
                              <p className="text-xs font-semibold flex items-center gap-1.5"><Download className="w-3 h-3 text-success" /> {formatSpeed(item.speed)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Time Left</p>
                              <p className="text-xs font-semibold flex items-center gap-1.5"><AlertCircle className="w-3 h-3 text-warning" /> {formatEta(item.eta)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Time Elapsed</p>
                              <p className="text-xs font-semibold">{formatElapsed(item.startTime)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Remaining</p>
                              <p className="text-xs font-semibold">{formatSize(Math.max(0, item.totalSize - item.downloaded))}</p>
                            </div>
                          </div>

                          <div className="flex justify-between text-[11px] font-medium text-text-muted pt-2 mt-2">
                            <span className="uppercase tracking-wider">Aria2c Engine v1.36.0 • Multi-threaded</span>
                            <span className="uppercase tracking-wider">Local Instance : 6800</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Queue Section */}
                  {queue.some(q => q.state === 'waiting' || q.state === 'paused' || q.state === 'failed') && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Queue ({queue.filter(q => q.state !== 'completed' && q.state !== 'downloading' && q.state !== 'resolving').length})</h3>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={queue.filter(q => q.state !== 'completed' && q.state !== 'downloading' && q.state !== 'resolving').map(i => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="grid gap-2">
                            {queue.filter(q => q.state !== 'completed' && q.state !== 'downloading' && q.state !== 'resolving').map(item => (
                              <SortableQueueItem
                                key={item.id}
                                item={item}
                                startDownload={startDownload}
                                retryDownload={retryDownload}
                                onRemove={(id) => setQueue(prev => prev.filter(q => q.id !== id))}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {/* History Section */}
                  {queue.some(q => q.state === 'completed') && (
                    <div className="space-y-4 pt-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Completed</h3>
                        <button
                          onClick={clearCompleted}
                          className="text-[10px] font-bold uppercase tracking-widest text-danger hover:opacity-80 transition-opacity"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="grid gap-2">
                        {queue.filter(q => q.state === 'completed').map(item => (
                          <div key={item.id} className="bg-bg-raised/50 border border-border-subtle/30 rounded-app p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success">
                                <CheckCircle2 className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-medium">{item.label}</h4>
                                <p className="text-[10px] text-text-muted mt-0.5">{formatSize(item.totalSize)} • Finished just now</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleOpenFolder(item.filename)}
                              className="text-[10px] font-bold uppercase tracking-widest bg-bg-raised px-3 py-1.5 rounded border border-border-subtle hover:border-text-muted transition-colors"
                            >
                              Open Folder
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {queue.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-text-muted space-y-4">
                      <div className="w-16 h-16 rounded-full bg-bg-raised flex items-center justify-center opacity-20">
                        <Download className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-medium">No active downloads. Paste a URL to get started.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="max-w-xl space-y-8"
                >
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Preferences</h2>
                    <p className="text-text-muted">Manage your application behavior and download engine.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2 relative">
                        <label className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                          <Palette className="w-3 h-3" /> Theme
                        </label>
                        <button
                          onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
                          className="w-full flex items-center justify-between bg-bg-surface border border-border-subtle rounded-app px-4 py-2.5 text-sm font-medium hover:border-accent transition-all group"
                        >
                          <span className="capitalize">{settings.theme.replace('-', ' ')}</span>
                          <ChevronDown className={cn("w-4 h-4 text-text-muted group-hover:text-accent transition-transform", themeDropdownOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                          {themeDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="absolute z-50 top-full left-0 right-0 mt-2 bg-bg-surface border border-border-subtle rounded-app shadow-2xl overflow-hidden py-1 max-h-[300px] overflow-y-auto"
                            >
                              {(['dark', 'oled', 'legacy', 'nordic', 'cyberpunk', 'dracula', 'macos-light', 'macos-dark', 'windows-light', 'windows-dark'] as const).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => updateTheme(t)}
                                  className={cn(
                                    "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent/10 whitespace-nowrap",
                                    settings.theme === t ? "text-accent font-bold bg-accent/5" : "text-text-primary"
                                  )}
                                >
                                  {t.replace('-', ' ')}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                          <Activity className="w-3 h-3" /> Accent Color
                        </label>
                        <div className="flex gap-3">
                          <div className="relative w-full">
                            <input
                              type="text"
                              value={settings.accent_color}
                              onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}
                              className="w-full bg-bg-surface border border-border-subtle rounded-app px-4 py-2 text-sm focus:outline-none focus:border-accent uppercase"
                            />
                          </div>
                          <input
                            type="color"
                            value={settings.accent_color}
                            onChange={(e) => setSettings({ ...settings, accent_color: e.target.value })}
                            className="w-12 h-10 p-1 bg-bg-surface border border-border-subtle rounded-app cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                        <FolderOpen className="w-3 h-3" /> Download Directory
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={settings.download_folder}
                          onChange={(e) => setSettings({ ...settings, download_folder: e.target.value })}
                          className="flex-1 bg-bg-raised border border-border-subtle rounded-app py-2 px-4 text-sm focus:outline-none focus:border-accent"
                        />
                        <input
                          type="file"
                          id="directory-upload"
                          className="hidden"
                          webkitdirectory=""
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                              const path = files[0].webkitRelativePath;
                              const folderName = path.split('/')[0];
                              setSettings({ ...settings, download_folder: `/${folderName}` });
                              addToast(`Download folder set to: /${folderName}`, 'success');
                            }
                          }}
                        />
                        <button
                          onClick={() => document.getElementById('directory-upload')?.click()}
                          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-app text-sm font-bold transition-colors"
                        >
                          Browse
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-bg-surface border border-border-subtle rounded-app space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-accent" /> Connections
                          </span>
                          <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">{settings.max_connections}</span>
                        </div>
                        <input
                          type="range" min="1" max="16"
                          value={settings.max_connections}
                          onChange={(e) => setSettings({ ...settings, max_connections: parseInt(e.target.value) })}
                          className="w-full accent-accent h-1.5 bg-bg-raised rounded-full cursor-pointer"
                        />
                      </div>
                      <div className="space-y-2">
                        <SettingToggle
                          icon={FolderOpen}
                          label="Game Folders"
                          description="Auto-create subfolders"
                          active={settings.game_specific_folders}
                          onToggle={() => setSettings({ ...settings, game_specific_folders: !settings.game_specific_folders })}
                        />
                        <SettingToggle
                          icon={Bell}
                          label="Notifications"
                          description="Desktop alerts"
                          active={settings.notifications_enabled}
                          onToggle={() => setSettings({ ...settings, notifications_enabled: !settings.notifications_enabled })}
                        />
                        <SettingToggle
                          icon={History}
                          label="Auto-Resume"
                          description="On startup"
                          active={settings.resume_on_start}
                          onToggle={() => setSettings({ ...settings, resume_on_start: !settings.resume_on_start })}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'info' && (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="space-y-6 pb-20"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* About Card */}
                    <div className="p-8 bg-bg-surface border border-border-subtle rounded-app hover:border-accent/40 transition-all duration-500 group flex flex-col">
                      <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 text-accent group-hover:scale-110 transition-transform">
                        <Info className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold mb-4">About FDP</h3>
                      <p className="text-sm text-text-muted leading-relaxed flex-1">
                        FitGirl Downloader Pro (FDP) is a high-performance utility designed to streamline the retrieval of game repacks from high-speed mirror providers like FuckingFast. It simplifies complex multi-part download management into a single, cohesive interface.
                      </p>
                      <div className="mt-8 pt-6 border-t border-border-subtle/50">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
                          <Activity className="w-3 h-3 text-success" /> System Status: Optimal
                        </div>
                      </div>
                    </div>

                    {/* Developer Card */}
                    <div className="p-8 bg-bg-surface border border-border-subtle rounded-app hover:border-accent/40 transition-all duration-500 group relative overflow-hidden flex flex-col">
                      <div className="relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 text-accent group-hover:scale-110 transition-transform">
                          <Github className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-bold mb-1">Rubayet Alam</h3>
                        <p className="text-xs text-accent font-bold uppercase tracking-widest mb-4">Lead Developer & Architect</p>
                        <p className="text-sm text-text-muted leading-relaxed mb-6">
                          Crafting digital experiences with precision and passion. Specialized in building high-speed network utilities and modern user interfaces for the global gaming community.
                        </p>
                        <a
                          href="https://github.com/Rubayet123"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-accent text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-accent/25"
                        >
                          <Github className="w-4 h-4" /> View Profile
                        </a>
                      </div>
                      <div className="absolute -bottom-8 -right-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                        <Github className="w-48 h-48" />
                      </div>
                    </div>

                    {/* Legal Card */}
                    <div className="p-8 bg-bg-surface border border-border-subtle rounded-app hover:border-danger/40 transition-all duration-500 group flex flex-col">
                      <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mb-6 text-danger group-hover:scale-110 transition-transform">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold mb-4">Legal Disclaimer</h3>
                      <p className="text-sm text-text-muted leading-relaxed flex-1">
                        FDP is a link resolution and download management tool. We do not host, store, or distribute any files. Users are responsible for the content they fetch and must ensure they comply with local laws and copyright regulations.
                      </p>
                      <div className="mt-8 flex gap-3">
                        <span className="px-3 py-1 rounded-full bg-bg-raised text-[10px] font-bold text-text-muted uppercase tracking-tighter">Open Source</span>
                        <span className="px-3 py-1 rounded-full bg-bg-raised text-[10px] font-bold text-text-muted uppercase tracking-tighter">Privacy First</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-accent/5 border border-accent/10 rounded-2xl flex items-start gap-4">
                    <Heart className="w-5 h-5 text-accent fill-accent shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-text-primary">Support the Project</p>
                      <p className="text-xs text-text-muted mt-1">Found a bug or have a feature request? Open an issue on GitHub or reach out via community channels.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Toast System */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={cn(
                "px-4 py-3 rounded-md shadow-xl border min-w-[240px] flex items-center gap-3 backdrop-blur-md",
                toast.type === 'success' ? 'bg-success/10 border-success/30 text-success' :
                  toast.type === 'error' ? 'bg-danger/10 border-danger/30 text-danger' :
                    'bg-bg-surface/80 border-border-subtle text-text-primary'
              )}
            >
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
              <span className="text-sm font-medium">{toast.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SettingToggle({ icon: Icon, label, description, active, onToggle }: { icon: any, label: string, description: string, active: boolean, onToggle: () => void }) {
  return (
    <div className="p-3 bg-bg-surface border border-border-subtle rounded-app flex items-center justify-between group hover:border-accent/40 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors", active ? "bg-accent/10 text-accent" : "bg-bg-raised text-text-muted")}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-bold">{label}</p>
          <p className="text-[10px] text-text-muted">{description}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          "w-8 h-4 rounded-full p-0.5 transition-colors relative",
          active ? 'bg-success' : 'bg-bg-raised'
        )}
      >
        <div className={cn("w-3 h-3 bg-white rounded-full transition-transform duration-200", active && 'translate-x-4')} />
      </button>
    </div>
  );
}

function SortableQueueItem({ item, startDownload, retryDownload, onRemove }: { item: QueueItem, startDownload: (id: string) => Promise<void> | void, retryDownload: (id: string) => void, onRemove: (id: string) => void, key?: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.6 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col gap-1">
      <div className="glass rounded-app p-4 flex items-center justify-between group">
        <div className="flex items-center gap-4">
          <button {...attributes} {...listeners} className="text-text-muted hover:text-accent cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </button>
          <div className={cn(
            "w-2 h-2 rounded-full",
            item.state === 'paused' ? 'bg-warning' : item.state === 'failed' ? 'bg-danger' : 'bg-text-muted'
          )} />
          <div>
            <h4 className="text-sm font-semibold max-w-[200px] truncate">{item.label}</h4>
            <p className="text-[10px] uppercase tracking-wider text-text-muted mt-0.5">{item.state}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {item.state === 'paused' && (
            <button
              onClick={() => startDownload(item.id)}
              className="text-xs font-bold text-accent px-3 py-1 bg-accent/5 rounded-md hover:bg-accent/10"
            >
              Resume
            </button>
          )}
          {item.state === 'failed' && (
            <button
              onClick={() => retryDownload(item.id)}
              className="text-xs font-bold text-warning px-3 py-1 bg-warning/5 rounded-md hover:bg-warning/10"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="text-text-muted hover:text-danger p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {item.state === 'failed' && item.error_message && (
        <div className="px-4 pb-4 mt-[-8px]">
          <p className="text-[10px] text-danger font-medium bg-danger/5 p-2 rounded border border-danger/10">
            Error: {item.error_message}
          </p>
        </div>
      )}
    </div>
  );
}

function SidebarButton({ icon: Icon, active, onClick, label }: { icon: any, active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-10 h-10 rounded-lg flex items-center justify-center transition-all group",
        active ? "bg-bg-raised text-accent" : "text-text-muted hover:bg-bg-raised hover:text-text-primary"
      )}
    >
      <Icon className="w-5 h-5" />
      {active && <div className="absolute left-[-16px] w-1 h-6 bg-accent rounded-r-full" />}

      {/* Tooltip */}
      <div className="absolute left-14 bg-bg-surface border border-border-subtle px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl">
        {label}
      </div>
    </button>
  );
}
