import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Banner } from '../../components/Banner';
import { Colors } from '../../utils/colors';
import { useAuth } from '../../store/AuthContext';
import { LandingBackground } from '../../components/LandingBackground';
import { PublicNavbar } from '../../components/PublicNavbar';

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

export function RegisterScreen({ navigation }) {
  const { register, busy } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('user'); // user | gatekeeper
  const [error, setError] = useState('');

  const validate = () => {
    if (!firstName.trim()) return 'First name is required';
    if (!lastName.trim()) return 'Last name is required';
    if (!username.trim()) return 'Username is required';
    if (!emailOk(email)) return 'Enter a valid email';
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (!['user', 'gatekeeper'].includes(String(role).toLowerCase())) return 'Role must be user or gatekeeper';
    return null;
  };

  const onSubmit = async () => {
    setError('');
    const v = validate();
    if (v) return setError(v);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        password,
        confirmPassword,
        role,
      });
    } catch (e) {
      const msg = e?.message || 'Registration failed';
      setError(msg);
      if (e?.code === 'RATE_LIMIT') Alert.alert('Please wait', msg);
    }
  };

  return (
    <LandingBackground>
      <PublicNavbar navigation={navigation} />
      <Screen transparent contentContainerStyle={{ paddingTop: 8, gap: 12 }}>
      <Card>
        <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '900' }}>Create account</Text>
        <Text style={{ color: Colors.muted }}>
          Role:{' '}
          <Text style={{ color: Colors.text, fontWeight: '800' }}>
            {role === 'gatekeeper' ? 'Gatekeeper' : 'User'}
          </Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="User"
            tone={role === 'user' ? 'primary' : 'warning'}
            onPress={() => setRole('user')}
            disabled={busy}
          />
          <Button
            title="Gatekeeper"
            tone={role === 'gatekeeper' ? 'primary' : 'warning'}
            onPress={() => setRole('gatekeeper')}
            disabled={busy}
          />
        </View>
      </Card>

      <Banner tone="danger" text={error} />

      <Card>
        <TextField label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <TextField label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <TextField label="Username" value={username} onChangeText={setUsername} placeholder="username" />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="example@email.com"
          keyboardType="email-address"
        />
        <TextField
          label="Phone (optional)"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="+20..."
          keyboardType="phone-pad"
        />
        <TextField label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
        <TextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        <Button title="Register" onPress={onSubmit} loading={busy} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text style={{ color: Colors.muted }}>Already have an account?</Text>
          <Pressable onPress={() => navigation.navigate('Login')}>
            <Text style={{ color: Colors.logoBlueLight, fontWeight: '800' }}>Login</Text>
          </Pressable>
        </View>
      </Card>
    </Screen>
    </LandingBackground>
  );
}

