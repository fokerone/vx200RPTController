'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SystemStatus, LogEntry, WeatherAlert, SeismEvent, AprsPosition } from '@/types/repeater';

interface SocketData {
  systemStatus: SystemStatus | null;
  logs: LogEntry[];
  weatherAlerts: WeatherAlert[];
  seismEvents: SeismEvent[];
  aprsPositions: AprsPosition[];
  isConnected: boolean;
}

export function useSocket(serverUrl: string = 'http://localhost:3001') {
  const [data, setData] = useState<SocketData>({
    systemStatus: null,
    logs: [],
    weatherAlerts: [],
    seismEvents: [],
    aprsPositions: [],
    isConnected: false,
  });

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Conectar a socket
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Conectado al servidor VX200');
      setData(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('disconnect', () => {
      console.log('Desconectado del servidor VX200');
      setData(prev => ({ ...prev, isConnected: false }));
    });

    // Eventos de estado del sistema
    socket.on('system_status', (status: SystemStatus) => {
      setData(prev => ({ ...prev, systemStatus: status }));
    });

    // Eventos de logs
    socket.on('log', (log: LogEntry) => {
      setData(prev => ({
        ...prev,
        logs: [log, ...prev.logs.slice(0, 99)], // Mantener últimos 100 logs
      }));
    });

    // Eventos de alertas meteorológicas
    socket.on('weather_alert', (alert: WeatherAlert) => {
      setData(prev => ({
        ...prev,
        weatherAlerts: [alert, ...prev.weatherAlerts.slice(0, 19)], // Últimas 20 alertas
      }));
    });

    // Eventos sísmicos
    socket.on('seism_detected', (seism: SeismEvent) => {
      setData(prev => ({
        ...prev,
        seismEvents: [seism, ...prev.seismEvents.slice(0, 9)], // Últimos 10 sismos
      }));
    });

    // Posiciones APRS
    socket.on('aprs_position', (position: AprsPosition) => {
      setData(prev => ({
        ...prev,
        aprsPositions: [position, ...prev.aprsPositions.slice(0, 49)], // Últimas 50 posiciones
      }));
    });

    // Actividad del canal
    socket.on('channel_activity', (active: boolean) => {
      setData(prev => ({
        ...prev,
        systemStatus: prev.systemStatus ? {
          ...prev.systemStatus,
          channel: {
            ...prev.systemStatus.channel,
            isActive: active,
            lastActivity: new Date().toISOString(),
          }
        } : null,
      }));
    });

    // DTMF detectado
    socket.on('dtmf', (sequence: string) => {
      setData(prev => ({
        ...prev,
        systemStatus: prev.systemStatus ? {
          ...prev.systemStatus,
          dtmf: { lastSequence: sequence }
        } : null,
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl]);

  // Funciones para enviar comandos
  const sendCommand = (command: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('command', command);
    }
  };

  const toggleService = (service: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('toggle_service', service);
    }
  };

  const requestStatus = () => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('request_status');
    }
  };

  return {
    ...data,
    sendCommand,
    toggleService,
    requestStatus,
  };
}