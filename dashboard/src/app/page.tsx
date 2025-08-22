'use client';

import React, { useState } from 'react';
import {
  Box,
  Toolbar,
  Container,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { AppBar } from '@/components/layout/AppBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { SystemOverview } from '@/components/dashboard/SystemOverview';
import { QuickControls } from '@/components/controls/QuickControls';
import { LogViewer } from '@/components/logs/LogViewer';
import { useSocket } from '@/hooks/useSocket';

export default function Dashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');

  // Conectar al socket del VX200
  const {
    systemStatus,
    logs,
    weatherAlerts,
    seismEvents,
    aprsPositions,
    isConnected,
    sendCommand,
    toggleService,
    requestStatus,
  } = useSocket();

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const renderTabContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <SystemOverview systemStatus={systemStatus} isConnected={isConnected} />
            <QuickControls
              systemStatus={systemStatus}
              onCommand={sendCommand}
              onToggleService={toggleService}
              isConnected={isConnected}
            />
          </Box>
        );
        
      case 'logs':
        return (
          <LogViewer 
            logs={logs} 
            onRefresh={requestStatus}
          />
        );
        
      case 'audio':
        // TODO: Implementar panel de audio detallado
        return <Box>Panel de Audio - En desarrollo</Box>;
        
      case 'weather':
        // TODO: Implementar panel de clima y alertas
        return <Box>Panel de Clima y Alertas - En desarrollo</Box>;
        
      case 'seismic':
        // TODO: Implementar panel sísmico
        return <Box>Panel de Monitoreo Sísmico - En desarrollo</Box>;
        
      case 'aprs':
        // TODO: Implementar panel APRS (sin mapa por ahora)
        return <Box>Panel APRS - En desarrollo</Box>;
        
      case 'settings':
        // TODO: Implementar configuración
        return <Box>Configuración - En desarrollo</Box>;
        
      default:
        return <SystemOverview systemStatus={systemStatus} isConnected={isConnected} />;
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        onMenuClick={handleMenuClick}
        systemStatus={systemStatus}
        isConnected={isConnected}
      />
      
      <Sidebar
        open={sidebarOpen}
        onClose={handleSidebarClose}
        currentTab={currentTab}
        onTabChange={setCurrentTab}
      />
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar /> {/* Spacer for AppBar */}
        
        <Container
          maxWidth="xl"
          sx={{
            py: 3,
            px: { xs: 2, sm: 3 },
          }}
        >
          {renderTabContent()}
        </Container>
      </Box>
    </Box>
  );
}
