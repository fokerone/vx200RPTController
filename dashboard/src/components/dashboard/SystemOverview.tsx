'use client';

import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {
  RadioButtonChecked,
  RadioButtonUnchecked,
  VolumeUp,
  VolumeOff,
  Wifi,
  WifiOff,
  Schedule,
  Memory,
  Thermostat,
  Warning,
  Terrain,
  TravelExplore,
} from '@mui/icons-material';
import { SystemStatus } from '@/types/repeater';

interface SystemOverviewProps {
  systemStatus: SystemStatus | null;
  isConnected: boolean;
}

export function SystemOverview({ systemStatus, isConnected }: SystemOverviewProps) {
  const theme = useTheme();

  if (!systemStatus) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Esperando datos del sistema...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  const getStatusColor = (status: string | boolean) => {
    if (typeof status === 'boolean') {
      return status ? 'success' : 'error';
    }
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const formatUptime = (uptime: number) => {
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('es-AR');
  };

  return (
    <Grid container spacing={3}>
      {/* Estado General */}
      <Grid item xs={12} md={6} lg={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              {isConnected ? <Wifi color="success" /> : <WifiOff color="error" />}
              <Typography variant="h6" sx={{ ml: 1 }}>
                Conexión
              </Typography>
            </Box>
            <Chip
              label={isConnected ? 'Conectado' : 'Desconectado'}
              color={isConnected ? 'success' : 'error'}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Uptime: {formatUptime(systemStatus.uptime)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Estado del Audio */}
      <Grid item xs={12} md={6} lg={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              {systemStatus.audio.isRecording ? <VolumeUp color="primary" /> : <VolumeOff color="error" />}
              <Typography variant="h6" sx={{ ml: 1 }}>
                Audio
              </Typography>
            </Box>
            <Chip
              label={systemStatus.audio.status.toUpperCase()}
              color={getStatusColor(systemStatus.audio.status)}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Dispositivo: {systemStatus.audio.device}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Volumen: {systemStatus.audio.volume}%
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Estado del Canal */}
      <Grid item xs={12} md={6} lg={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              {systemStatus.channel.isActive ? <RadioButtonChecked color="error" /> : <RadioButtonUnchecked color="success" />}
              <Typography variant="h6" sx={{ ml: 1 }}>
                Canal
              </Typography>
            </Box>
            <Chip
              label={systemStatus.channel.isActive ? 'OCUPADO' : 'LIBRE'}
              color={systemStatus.channel.isActive ? 'error' : 'success'}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Señal: {systemStatus.channel.signalLevel}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Última actividad: {formatDate(systemStatus.channel.lastActivity)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Roger Beep */}
      <Grid item xs={12} md={6} lg={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Schedule color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                Roger Beep
              </Typography>
            </Box>
            <Chip
              label={systemStatus.rogerBeep.enabled ? 'ACTIVO' : 'INACTIVO'}
              color={getStatusColor(systemStatus.rogerBeep.enabled)}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Tipo: {systemStatus.rogerBeep.type}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Volumen: {systemStatus.rogerBeep.volume}%
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Baliza */}
      <Grid item xs={12} md={6} lg={4}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Memory color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                Baliza Automática
              </Typography>
            </Box>
            <Chip
              label={systemStatus.baliza.running ? 'EJECUTÁNDOSE' : 'DETENIDA'}
              color={getStatusColor(systemStatus.baliza.running)}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Intervalo: {systemStatus.baliza.interval} min
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Última: {formatDate(systemStatus.baliza.lastTransmission)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Próxima: {formatDate(systemStatus.baliza.nextTransmission)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* Alertas Meteorológicas */}
      <Grid item xs={12} md={6} lg={4}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Thermostat color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                Alertas Meteorológicas
              </Typography>
            </Box>
            <Chip
              label={`${systemStatus.weatherAlerts.activeAlerts} ALERTAS ACTIVAS`}
              color={systemStatus.weatherAlerts.activeAlerts > 0 ? 'warning' : 'success'}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Estado: {systemStatus.weatherAlerts.state}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Última verificación: {formatDate(systemStatus.weatherAlerts.lastCheck)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Próxima: {formatDate(systemStatus.weatherAlerts.nextCheck)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* APRS */}
      <Grid item xs={12} md={6} lg={4}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TravelExplore color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                APRS
              </Typography>
            </Box>
            <Chip
              label={systemStatus.aprs.connected ? 'CONECTADO' : 'DESCONECTADO'}
              color={getStatusColor(systemStatus.aprs.connected)}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Indicativo: {systemStatus.aprs.callsign}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Última baliza: {formatDate(systemStatus.aprs.lastBeacon)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Posiciones recibidas: {systemStatus.aprs.positionsReceived}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* INPRES Sísmico */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Terrain color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                Monitoreo Sísmico INPRES
              </Typography>
            </Box>
            <Chip
              label={systemStatus.inpres.state.toUpperCase()}
              color={getStatusColor(systemStatus.inpres.enabled)}
              variant="outlined"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Sismos detectados hoy: {systemStatus.inpres.seismsToday}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Última verificación: {formatDate(systemStatus.inpres.lastCheck)}
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      {/* DTMF */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Warning color="primary" />
              <Typography variant="h6" sx={{ ml: 1 }}>
                DTMF
              </Typography>
            </Box>
            <Typography variant="body1" sx={{ 
              fontFamily: 'monospace', 
              fontSize: '1.2rem',
              fontWeight: 'bold',
              color: theme.palette.primary.main,
            }}>
              {systemStatus.dtmf.lastSequence}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Última secuencia detectada
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}