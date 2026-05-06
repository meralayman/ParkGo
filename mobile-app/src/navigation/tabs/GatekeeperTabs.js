import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { GateQrScannerScreen } from '../../screens/gatekeeper/GateQrScannerScreen';
import { GateActionScreen } from '../../screens/gatekeeper/GateActionScreen';
import { HeaderRightLogout } from '../widgets/HeaderRightLogout';
import { navScreenOptions } from '../widgets/navScreenOptions';

const Tab = createBottomTabNavigator();

export function GatekeeperTabs() {
  return (
    <Tab.Navigator screenOptions={{ ...navScreenOptions, headerRight: () => <HeaderRightLogout /> }}>
      <Tab.Screen name="Scan" component={GateQrScannerScreen} options={{ title: 'QR Scanner' }} />
      <Tab.Screen name="Gate" component={GateActionScreen} options={{ title: 'Check-in/out' }} />
    </Tab.Navigator>
  );
}

