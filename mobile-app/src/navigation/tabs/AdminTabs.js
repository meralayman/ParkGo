import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AdminDashboardScreen } from '../../screens/admin/AdminDashboardScreen';
import { HeaderRightLogout } from '../widgets/HeaderRightLogout';
import { navScreenOptions } from '../widgets/navScreenOptions';

const Tab = createBottomTabNavigator();

export function AdminTabs() {
  return (
    <Tab.Navigator screenOptions={{ ...navScreenOptions, headerRight: () => <HeaderRightLogout /> }}>
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin' }} />
    </Tab.Navigator>
  );
}

