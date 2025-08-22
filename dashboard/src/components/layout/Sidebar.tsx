'use client';

import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Dashboard,
  Radio,
  Thermostat,
  Warning,
  Terrain,
  TravelExplore,
  Settings,
  Timeline,
  Article,
} from '@mui/icons-material';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Dashboard },
  { id: 'audio', label: 'Audio y Canal', icon: Radio },
  { id: 'weather', label: 'Clima y Alertas', icon: Thermostat },
  { id: 'seismic', label: 'Monitoreo Sísmico', icon: Terrain },
  { id: 'aprs', label: 'APRS', icon: TravelExplore },
  { id: 'logs', label: 'Logs del Sistema', icon: Article },
  { id: 'settings', label: 'Configuración', icon: Settings },
];

export function Sidebar({ open, onClose, currentTab, onTabChange }: SidebarProps) {
  const theme = useTheme();
  const drawerWidth = 280;

  const handleItemClick = (tabId: string) => {
    onTabChange(tabId);
    // En móviles, cerrar el drawer después de seleccionar
    if (theme.breakpoints.down('md')) {
      onClose();
    }
  };

  const drawerContent = (
    <>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Radio color="primary" />
          <Typography variant="h6" noWrap>
            VX200
          </Typography>
        </Box>
      </Toolbar>
      
      <Divider />
      
      <List>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isSelected = currentTab === item.id;
          
          return (
            <ListItem key={item.id} disablePadding>
              <ListItemButton
                selected={isSelected}
                onClick={() => handleItemClick(item.id)}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.main + '20',
                    '&:hover': {
                      backgroundColor: theme.palette.primary.main + '30',
                    },
                  },
                }}
              >
                <ListItemIcon>
                  <Icon 
                    color={isSelected ? 'primary' : 'inherit'} 
                  />
                </ListItemIcon>
                <ListItemText 
                  primary={item.label}
                  primaryTypographyProps={{
                    color: isSelected ? 'primary' : 'inherit',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />
      
      <Box sx={{ p: 2, mt: 'auto' }}>
        <Typography variant="body2" color="text.secondary" align="center">
          VX200 Dashboard v1.0
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center">
          Made with ❤️ for Hams
        </Typography>
      </Box>
    </>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
    >
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
}