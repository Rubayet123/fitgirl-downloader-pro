export interface FFLink {
  part_number: number;
  label: string;
  ff_url: string;
  file_size: string;
}

export type QueueItemState = 'waiting' | 'resolving' | 'downloading' | 'paused' | 'completed' | 'failed';

export interface QueueItem {
  id: string;
  label: string;
  ff_url: string;
  cdn_url: string;
  state: QueueItemState;
  filename: string;
  progress: number; // 0 to 100
  downloaded: number; // bytes
  totalSize: number; // bytes
  speed: number; // bytes/sec
  eta: number; // seconds
  startTime?: number; // timestamp
  error_message?: string;
}

export interface Settings {
  download_folder: string;
  max_connections: number;
  resume_on_start: boolean;
  accent_color: string;
  theme: 'dark' | 'oled' | 'legacy' | 'nordic' | 'cyberpunk' | 'dracula' | 'macos-light' | 'macos-dark' | 'windows-light' | 'windows-dark';
  game_specific_folders: boolean;
  notifications_enabled: boolean;
}
