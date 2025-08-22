'use client';

import React from 'react';
import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Box,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Notifications,
  RadioButtonChecked,
  RadioButtonUnchecked,
  Wifi,
  WifiOff,
} from '@mui/icons-material';
import { SystemStatus } from '@/types/repeater';

interface AppBarProps {
  onMenuClick: () => void;
  systemStatus: SystemStatus | null;
  isConnected: boolean;
}

export function AppBar({ onMenuClick, systemStatus, isConnected }: AppBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const getUptimeString = (uptime: number) => {
    const hours = Math.floor(uptime / 3600000);
    const minutes = Math.floor((uptime % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const activeAlerts = systemStatus?.weatherAlerts?.activeAlerts || 0;
  const channelActive = systemStatus?.channel?.isActive || false;

  return (
    <MuiAppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          onClick={onMenuClick}
          edge="start"
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
          VX200 Repetidora Dashboard
        </Typography>

        {!isMobile && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
            {/* Estado del canal */}
            <Chip
              icon={channelActive ? <RadioButtonChecked /> : <RadioButtonUnchecked />}
              label={channelActive ? 'Canal Activo' : 'Canal Libre'}
              color={channelActive ? 'error' : 'success'}
              variant="outlined"
              size="small"
            />

            {/* Tiempo de actividad */}
            {systemStatus && (
              <Chip
                label={`Uptime: ${getUptimeString(systemStatus.uptime)}`}
                variant="outlined"
                size="small"
              />
            )}

            {/* Estado de conexión */}
            <Chip
              icon={isConnected ? <Wifi /> : <WifiOff />}
              label={isConnected ? 'Conectado' : 'Desconectado'}
              color={isConnected ? 'success' : 'error'}
              variant="outlined"
              size="small"
            />
          </Box>
        )}

        {/* Notificaciones */}
        <IconButton
          size="large"
          aria-label={`${activeAlerts} alertas activas`}
          color="inherit"
        >
          <Badge badgeContent={activeAlerts} color="error">
            <Notifications />
          </Badge>
        </IconButton>
      </Toolbar>
    </MuiAppBar>
  );
}