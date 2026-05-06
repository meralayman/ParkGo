import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { useAuth } from '../../store/AuthContext';
import { getApiBaseUrl } from '../../utils/config';
import { ParkingIllustration } from '../../components/ParkingIllustration';
import { LandingBackground } from '../../components/LandingBackground';
import { PublicNavbar } from '../../components/PublicNavbar';

export function LoginScreen({ navigation }) {
  const { login, busy } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const validate = () => {
    if (!usernameOrEmail.trim()) return 'Email/username is required';
    if (!password) return 'Password is required';
    return null;
  };

  const onSubmit = async () => {
    setError('');
    const v = validate();
    if (v) return setError(v);
    try {
      await login({ usernameOrEmail: usernameOrEmail.trim(), password });
    } catch (e) {
      const msg = e?.message || 'Login failed';
      setError(msg);
      if (e?.code === 'RATE_LIMIT') {
        Alert.alert('Too many attempts', msg);
      }
    }
  };

  return (
    <LandingBackground>
      <PublicNavbar navigation={navigation} />

      <Screen contentContainerStyle={{ paddingTop: 18, gap: 16 }}>
        <View style={{ gap: 10 }}>
          <Text style={{ color: Colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.6 }}>
            Welcome back
          </Text>
          <Text style={{ color: 'rgba(148,163,184,0.95)', lineHeight: 19 }}>
            Sign in to book, scan, and manage parking securely.
          </Text>
        </View>

        <ParkingIllustration height={160} />

        <Text style={{ color: 'rgba(148,163,184,0.85)', fontSize: 12 }}>
          API: <Text style={{ color: Colors.text, fontWeight: '800' }}>{getApiBaseUrl()}</Text>
        </Text>

        <Banner tone="danger" text={error} />

        <Card>
          <TextField
            label="Email or username"
            value={usernameOrEmail}
            onChangeText={setUsernameOrEmail}
            placeholder="example@email.com"
            autoCapitalize="none"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />
          <Button title="Login" onPress={onSubmit} loading={busy} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
            <Text style={{ color: Colors.muted }}>No account?</Text>
            <Pressable onPress={() => navigation.navigate('Register')}>
              <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Register</Text>
            </Pressable>
          </View>
        </Card>
      </Screen>
    </LandingBackground>
  );
}

