'use client';

import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Box,
  Chip,
  Divider,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  VolumeUp,
  VolumeOff,
  Schedule,
  Thermostat,
  Warning,
  Terrain,
  TravelExplore,
  Radio,
  RestartAlt,
  PowerSettingsNew,
} from '@mui/icons-material';
import { SystemStatus } from '@/types/repeater';

interface QuickControlsProps {
  systemStatus: SystemStatus | null;
  onCommand: (command: string) => void;
  onToggleService: (service: string) => void;
  isConnected: boolean;
}

export function QuickControls({ 
  systemStatus, 
  onCommand, 
  onToggleService, 
  isConnected 
}: QuickControlsProps) {
  
  const handleDTMFCommand = (sequence: string) => {
    onCommand(`dtmf:${sequence}`);
  };

  const dtmfCommands = [
    { sequence: '*1', label: 'Fecha/Hora', icon: Schedule },
    { sequence: '*4', label: 'Clima', icon: Thermostat },
    { sequence: '*7', label: 'Alertas Met.', icon: Warning },
    { sequence: '*3', label: 'INPRES', icon: Terrain },
    { sequence: '*9', label: 'Baliza Manual', icon: Radio },
  ];

  const serviceControls = [
    {
      service: 'audio',
      label: 'Audio',
      icon: systemStatus?.audio.isRecording ? VolumeUp : VolumeOff,
      active: systemStatus?.audio.isRecording || false,
    },
    {
      service: 'baliza',
      label: 'Baliza Auto',
      icon: systemStatus?.baliza.running ? Stop : PlayArrow,
      active: systemStatus?.baliza.running || false,
    },
  ];

  return (
    <Grid container spacing={3}>
      {/* Comandos DTMF */}
      <Grid item xs={12} lg={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Comandos DTMF
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Ejecutar comandos de prueba del sistema
            </Typography>
            
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {dtmfCommands.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <Grid item xs={6} sm={4} md={3} key={cmd.sequence}>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<Icon />}
                      onClick={() => handleDTMFCommand(cmd.sequence)}
                      disabled={!isConnected}
                      sx={{
                        height: 64,
                        flexDirection: 'column',
                        gap: 0.5,
                      }}
                    >
                      <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                        {cmd.sequence}
                      </Typography>
                      <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>
                        {cmd.label}
                      </Typography>
                    </Button>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Controles de Servicios */}
      <Grid item xs={12} lg={4}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Control de Servicios
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {serviceControls.map((control) => {
                const Icon = control.icon;
                return (
                  <Box
                    key={control.service}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Icon color={control.active ? 'primary' : 'disabled'} />
                      <Typography variant="body2">
                        {control.label}
                      </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={control.active ? 'ON' : 'OFF'}
                        color={control.active ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onToggleService(control.service)}
                        disabled={!isConnected}
                      >
                        {control.active ? 'Detener' : 'Iniciar'}
                      </Button>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Controles del Sistema */}
            <Typography variant="subtitle2" gutterBottom>
              Sistema
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<RestartAlt />}
                onClick={() => onCommand('restart')}
                disabled={!isConnected}
                color="warning"
                size="small"
              >
                Reiniciar Sistema
              </Button>
              
              <Button
                variant="outlined"
                startIcon={<PowerSettingsNew />}
                onClick={() => onCommand('shutdown')}
                disabled={!isConnected}
                color="error"
                size="small"
              >
                Apagar Sistema
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Estado de Conexión */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Estado de Conexión
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip
                label={isConnected ? 'Conectado al VX200' : 'Desconectado'}
                color={isConnected ? 'success' : 'error'}
                variant="outlined"
              />
              
              {systemStatus && (
                <Chip
                  label={`DTMF: ${systemStatus.dtmf.lastSequence}`}
                  variant="outlined"
                />
              )}
              
              <Button
                variant="outlined"
                size="small"
                onClick={() => onCommand('request_status')}
                disabled={!isConnected}
              >
                Actualizar Estado
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}