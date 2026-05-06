import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { UserDashboardScreen } from '../../screens/user/UserDashboardScreen';
import { BookingScreen } from '../../screens/user/BookingScreen';
import { QrCodeScreen } from '../../screens/user/QrCodeScreen';
import { BookingHistoryScreen } from '../../screens/user/BookingHistoryScreen';
import { HeaderRightLogout } from '../widgets/HeaderRightLogout';
import { navScreenOptions } from '../widgets/navScreenOptions';

const Tab = createBottomTabNavigator();

export function UserTabs() {
  return (
    <Tab.Navigator screenOptions={{ ...navScreenOptions, headerRight: () => <HeaderRightLogout /> }}>
      <Tab.Screen name="Dashboard" component={UserDashboardScreen} />
      <Tab.Screen name="Book" component={BookingScreen} options={{ title: 'Booking' }} />
      <Tab.Screen name="QR" component={QrCodeScreen} options={{ title: 'My QR' }} />
      <Tab.Screen name="History" component={BookingHistoryScreen} options={{ title: 'Bookings' }} />
    </Tab.Navigator>
  );
}

