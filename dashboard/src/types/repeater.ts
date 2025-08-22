export interface SystemStatus {
  timestamp: string;
  uptime: number;
  audio: AudioStatus;
  channel: ChannelStatus;
  baliza: BalizaStatus;
  datetime: DateTimeStatus;
  weather: WeatherStatus;
  weatherAlerts: WeatherAlertsStatus;
  inpres: InpresStatus;
  aprs: AprsStatus;
  rogerBeep: RogerBeepStatus;
  dtmf: DtmfStatus;
}

export interface AudioStatus {
  status: 'active' | 'inactive' | 'error';
  isRecording: boolean;
  device: string;
  volume: number;
}

export interface ChannelStatus {
  isActive: boolean;
  signalLevel: number;
  lastActivity: string;
}

export interface BalizaStatus {
  enabled: boolean;
  running: boolean;
  interval: number;
  lastTransmission: string;
  nextTransmission: string;
}

export interface DateTimeStatus {
  enabled: boolean;
  timezone: string;
}

export interface WeatherStatus {
  enabled: boolean;
  apiKey: boolean;
  lastUpdate: string;
}

export interface WeatherAlertsStatus {
  enabled: boolean;
  state: string;
  activeAlerts: number;
  lastCheck: string;
  nextCheck: string;
}

export interface InpresStatus {
  enabled: boolean;
  state: string;
  lastCheck: string;
  seismsToday: number;
}

export interface AprsStatus {
  enabled: boolean;
  connected: boolean;
  callsign: string;
  lastBeacon: string;
  positionsReceived: number;
}

export interface RogerBeepStatus {
  enabled: boolean;
  type: string;
  volume: number;
}

export interface DtmfStatus {
  lastSequence: string;
}

export interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: string;
  expires: string;
  firstSeen: number;
}

export interface SeismEvent {
  id: string;
  magnitude: number;
  depth: number;
  location: string;
  time: string;
  distance: number;
  intensity: string;
}

export interface AprsPosition {
  callsign: string;
  lat: number;
  lon: number;
  timestamp: string;
  comment: string;
  symbol: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  module?: string;
}