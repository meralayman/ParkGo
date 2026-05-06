import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../store/AuthContext';
import { Colors } from '../utils/colors';

import { AuthStack } from './stacks/AuthStack';
import { UserTabs } from './tabs/UserTabs';
import { GatekeeperTabs } from './tabs/GatekeeperTabs';
import { AdminTabs } from './tabs/AdminTabs';

const Stack = createNativeStackNavigator();

function FullscreenLoader() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={Colors.logoBlue} />
    </View>
  );
}

function AppRootByRole({ role }) {
  const norm = String(role || '').toLowerCase();
  if (norm === 'admin') return <AdminTabs />;
  if (norm === 'gatekeeper') return <GatekeeperTabs />;
  return <UserTabs />;
}

export function RootNavigator() {
  const { bootstrapped, isAuthed, role } = useAuth();

  if (!bootstrapped) return <FullscreenLoader />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthed ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : (
          <Stack.Screen name="App" children={() => <AppRootByRole role={role} />} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

