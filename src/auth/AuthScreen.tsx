import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from './AuthProvider';

const palette = {
  ink: '#172622', muted: '#687670', canvas: '#F4F6F1', surface: '#FFFFFF', line: '#DEE5DE',
  brand: '#176B52', brandDark: '#0C4B39', brandPale: '#E1F2EA', red: '#B84A43', amberPale: '#FFF1D9',
};

export function AuthScreen() {
  const { configured, signIn, signUp, continueInDemo } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMessage('');
    if (mode === 'signup' && fullName.trim().length < 2) return setError('Enter your full name.');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must have at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const result = await signUp(fullName, email, password);
        if (result.requiresEmailVerification) {
          setMessage('Account created. Check your email to confirm it, then sign in.');
          setMode('signin');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
          <View><Text style={styles.brandName}>RentFlow</Text><Text style={styles.brandTag}>Property records, clearly managed</Text></View>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable onPress={() => { setMode('signin'); setError(''); }} style={[styles.tab, mode === 'signin' && styles.tabActive]}>
              <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable onPress={() => { setMode('signup'); setError(''); }} style={[styles.tab, mode === 'signup' && styles.tabActive]}>
              <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create account</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</Text>
          <Text style={styles.subtitle}>{mode === 'signin' ? 'Sign in to manage collections and records.' : 'The first account becomes the workspace owner.'}</Text>

          {mode === 'signup' && <AuthField label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Ray Kamau" autoCapitalize="words" />}
          <AuthField label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <AuthField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry />

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
          {message ? <View style={styles.messageBox}><Text style={styles.messageText}>{message}</Text></View> : null}

          <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.submitButton, (pressed || busy) && styles.pressed]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{mode === 'signin' ? 'Sign in securely' : 'Create account'}</Text>}
          </Pressable>

          {!configured && (
            <View style={styles.demoSection}>
              <Text style={styles.demoTitle}>Preview mode</Text>
              <Text style={styles.demoText}>The screens are ready. Connect Supabase environment keys to activate real accounts and shared records.</Text>
              <Pressable onPress={continueInDemo} style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}>
                <Text style={styles.demoButtonText}>Continue with demo workspace</Text>
              </Pressable>
            </View>
          )}
        </View>
        <Text style={styles.securityNote}>Every change is attributed to a signed-in user and time-stamped.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthField(props: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string;
  secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor="#97A19D" selectionColor={palette.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  pageContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 24 },
  brandMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: palette.surface, fontSize: 23, fontWeight: '900' },
  brandName: { color: palette.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.7 },
  brandTag: { color: palette.muted, fontSize: 10, marginTop: 1 },
  card: { width: '100%', maxWidth: 450, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 22, padding: 24 },
  tabs: { flexDirection: 'row', backgroundColor: palette.canvas, borderRadius: 12, padding: 4, marginBottom: 25 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  tabActive: { backgroundColor: palette.surface },
  tabText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: palette.brandDark },
  title: { color: palette.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 21 },
  field: { marginBottom: 14 },
  label: { color: palette.ink, fontSize: 10, fontWeight: '700', marginBottom: 7 },
  input: { height: 48, backgroundColor: '#FAFBF9', borderWidth: 1, borderColor: palette.line, borderRadius: 11, paddingHorizontal: 13, color: palette.ink, fontSize: 12 },
  submitButton: { height: 50, borderRadius: 12, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  submitText: { color: palette.surface, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  errorBox: { backgroundColor: '#FBE7E5', borderRadius: 9, padding: 10, marginBottom: 10 },
  errorText: { color: palette.red, fontSize: 10, lineHeight: 15 },
  messageBox: { backgroundColor: palette.brandPale, borderRadius: 9, padding: 10, marginBottom: 10 },
  messageText: { color: palette.brandDark, fontSize: 10, lineHeight: 15 },
  demoSection: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 22, paddingTop: 18 },
  demoTitle: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  demoText: { color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  demoButton: { height: 43, borderRadius: 11, backgroundColor: palette.amberPale, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  demoButtonText: { color: '#8C5819', fontSize: 11, fontWeight: '800' },
  securityNote: { color: palette.muted, fontSize: 9, textAlign: 'center', marginTop: 17 },
});
