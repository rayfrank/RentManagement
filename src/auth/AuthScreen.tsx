import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GlassControl } from '../theme/GlassControl';
import { themes, type ThemeName, type ThemePalette, useTheme } from '../theme/ThemeProvider';
import { useAuth } from './AuthProvider';

type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const { configured, passwordRecovery, signIn, signUp, requestPasswordReset, completePasswordReset, cancelPasswordRecovery, continueInDemo } = useAuth();
  const { palette, theme, setTheme } = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async () => {
    setError('');
    setMessage('');
    if (passwordRecovery) {
      if (password.length < 8) return setError('Your new password must have at least 8 characters.');
      if (password !== confirmPassword) return setError('The passwords do not match.');
    } else if (mode === 'forgot') {
      if (!email.includes('@')) return setError('Enter the email address used for your account.');
    } else {
      if (mode === 'signup' && fullName.trim().length < 2) return setError('Enter your full name.');
      if (!email.includes('@')) return setError('Enter a valid email address.');
      if (password.length < 8) return setError('Password must have at least 8 characters.');
      if (mode === 'signup' && password !== confirmPassword) return setError('The passwords do not match.');
    }

    setBusy(true);
    try {
      if (passwordRecovery) {
        await completePasswordReset(password);
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        setMessage('Password reset link sent. Check your email and open it on this device.');
      } else if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const result = await signUp(fullName, email, password);
        if (result.requiresEmailVerification) {
          setMessage('Account created. Check your email, then tap Verify email to return to RentFlow.');
          setMode('signin');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const title = passwordRecovery ? 'Choose a new password' : mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your workspace' : 'Reset your password';
  const subtitle = passwordRecovery
    ? 'Make it memorable, private, and at least eight characters.'
    : mode === 'signin'
      ? 'Your properties, collections, and audit trail are ready.'
      : mode === 'signup'
        ? 'The first account becomes the workspace owner.'
        : 'We will email you a secure link to choose a new password.';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.page}>
      <View pointerEvents="none" style={styles.ambient}>
        <View style={[styles.glow, styles.glowOne]} />
        <View style={[styles.glow, styles.glowTwo]} />
        <View style={styles.lightWash} />
      </View>

      <ScrollView contentContainerStyle={[styles.pageContent, !wide && { width: Math.max(width - 48, 272), maxWidth: Math.max(width - 48, 272), paddingHorizontal: 0 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Brand styles={styles} />
          <View style={styles.appearanceStack}>
            <ThemePicker compact={!wide} theme={theme} setTheme={setTheme} palette={palette} styles={styles} />
            <GlassControl compact={!wide} />
          </View>
        </View>

        <View style={[styles.stage, wide && styles.stageWide]}>
          {wide && (
            <View style={styles.hero}>
              <View style={styles.eyebrow}><Text style={styles.eyebrowText}>RENT, IN PERFECT FOCUS</Text></View>
              <Text style={styles.heroTitle}>Clarity for every{`\n`}door you manage.</Text>
              <Text style={styles.heroText}>A calm command centre for rent, M-Pesa receipts, tenant records, and every change your team makes.</Text>
              <View style={styles.promiseGrid}>
                <Promise symbol="◎" title="One view" copy="Collections and balances" styles={styles} />
                <Promise symbol="✦" title="AI assisted" copy="Helpful, always reviewed" styles={styles} />
                <Promise symbol="⌁" title="Accountable" copy="Every edit attributed" styles={styles} />
              </View>
            </View>
          )}

          <View style={[styles.cardShell, !wide && { maxWidth: Math.max(width - 48, 272) }]}>
            <View style={styles.cardHighlight} />
            <View style={styles.card}>
              {!passwordRecovery && mode !== 'forgot' && (
                <View style={styles.tabs}>
                  <Pressable onPress={() => changeMode('signin')} style={[styles.tab, mode === 'signin' && styles.tabActive]}>
                    <Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign in</Text>
                  </Pressable>
                  <Pressable onPress={() => changeMode('signup')} style={[styles.tab, mode === 'signup' && styles.tabActive]}>
                    <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create account</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>

              {mode === 'signup' && !passwordRecovery && <AuthField label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Ray Kamau" autoCapitalize="words" palette={palette} styles={styles} />}
              {!passwordRecovery && <AuthField label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" palette={palette} styles={styles} />}
              {mode !== 'forgot' && <AuthField label={passwordRecovery ? 'New password' : 'Password'} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry palette={palette} styles={styles} />}
              {(mode === 'signup' || passwordRecovery) && <AuthField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Type it once more" secureTextEntry palette={palette} styles={styles} />}

              {mode === 'signin' && !passwordRecovery && (
                <Pressable onPress={() => changeMode('forgot')} style={styles.forgotButton}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
              )}

              {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
              {message ? <View style={styles.messageBox}><Text style={styles.messageText}>{message}</Text></View> : null}

              <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.submitButton, (pressed || busy) && styles.pressed]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{passwordRecovery ? 'Save new password' : mode === 'signin' ? 'Sign in securely' : mode === 'signup' ? 'Create account' : 'Email reset link'}</Text>}
              </Pressable>

              {(mode === 'forgot' || passwordRecovery) && (
                <Pressable onPress={() => passwordRecovery ? cancelPasswordRecovery() : changeMode('signin')} style={styles.backButton}>
                  <Text style={styles.backText}>← Back to sign in</Text>
                </Pressable>
              )}

              {!configured && !passwordRecovery && (
                <View style={styles.demoSection}>
                  <Text style={styles.demoTitle}>Preview the workspace</Text>
                  <Text style={styles.demoText}>Explore the complete interface with sample property records.</Text>
                  <Pressable onPress={continueInDemo} style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}>
                    <Text style={styles.demoButtonText}>Continue in demo mode</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.securityNote}>Private by design · Every important change is time-stamped and attributed.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Brand({ styles }: { styles: Styles }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}><View style={styles.brandOrb} /><Text style={styles.brandMarkText}>R</Text></View>
      <View><Text style={styles.brandName}>RentFlow</Text><Text style={styles.brandTag}>Property intelligence</Text></View>
    </View>
  );
}

function Promise({ symbol, title, copy, styles }: { symbol: string; title: string; copy: string; styles: Styles }) {
  return <View style={styles.promise}><Text style={styles.promiseSymbol}>{symbol}</Text><View><Text style={styles.promiseTitle}>{title}</Text><Text style={styles.promiseCopy}>{copy}</Text></View></View>;
}

function ThemePicker({ compact, theme, setTheme, palette, styles }: { compact: boolean; theme: ThemeName; setTheme: (theme: ThemeName) => void; palette: ThemePalette; styles: Styles }) {
  return (
    <View style={styles.themePicker}>
      {(Object.keys(themes) as ThemeName[]).map((name) => (
        <Pressable key={name} accessibilityLabel={`Use ${themes[name].label} theme`} onPress={() => setTheme(name)} style={[styles.themeChoice, theme === name && styles.themeChoiceActive]}>
          <View style={[styles.themeDot, { backgroundColor: themes[name].palette.brand }]} />
          {!compact && <Text style={[styles.themeText, theme === name && { color: palette.ink }]}>{themes[name].label}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function AuthField(props: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string; palette: ThemePalette; styles: Styles;
  secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address'; autoCapitalize?: 'none' | 'words';
}) {
  const [visible, setVisible] = useState(false);
  const { label, palette, styles, secureTextEntry, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput {...inputProps} secureTextEntry={secureTextEntry && !visible} style={styles.input} placeholderTextColor={palette.muted} selectionColor={palette.brand} />
        {secureTextEntry && (
          <Pressable onPress={() => setVisible((current) => !current)} hitSlop={9} style={styles.visibilityButton}>
            <Text style={styles.visibilityText}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (palette: ThemePalette) => StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  ambient: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  glow: { position: 'absolute', width: 440, height: 440, borderRadius: 220, opacity: 0.42 },
  glowOne: { backgroundColor: palette.glowOne, left: -160, top: -160 },
  glowTwo: { backgroundColor: palette.glowTwo, right: -170, bottom: -190 },
  lightWash: { position: 'absolute', left: '15%', right: '10%', top: '16%', height: 220, borderRadius: 110, backgroundColor: '#FFFFFF55', transform: [{ rotate: '-8deg' }] },
  pageContent: { flexGrow: 1, width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  appearanceStack: { alignItems: 'flex-end', gap: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: palette.brand, shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  brandOrb: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF42', top: -8, right: -5 },
  brandMarkText: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  brandName: { color: palette.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.8 },
  brandTag: { color: palette.muted, fontSize: 9, marginTop: 1, letterSpacing: 0.4 },
  themePicker: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: '#FFFFFF8F', borderWidth: 1, borderColor: '#FFFFFFC9' },
  themeChoice: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999 },
  themeChoiceActive: { backgroundColor: '#FFFFFFD9' },
  themeDot: { width: 7, height: 7, borderRadius: 4 },
  themeText: { color: palette.muted, fontSize: 8, fontWeight: '800' },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 42 },
  stageWide: { flexDirection: 'row', gap: 78, justifyContent: 'center' },
  hero: { width: 470 },
  eyebrow: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF9C', borderWidth: 1, borderColor: '#FFFFFFD1' },
  eyebrowText: { color: palette.brandDark, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  heroTitle: { color: palette.ink, fontSize: 51, lineHeight: 55, fontWeight: '900', letterSpacing: -2.7, marginTop: 21 },
  heroText: { color: palette.muted, fontSize: 14, lineHeight: 23, maxWidth: 430, marginTop: 19 },
  promiseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 31 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFFFFF8A', borderWidth: 1, borderColor: '#FFFFFFC2', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11 },
  promiseSymbol: { color: palette.brand, fontSize: 17, fontWeight: '900' },
  promiseTitle: { color: palette.ink, fontSize: 9, fontWeight: '900' },
  promiseCopy: { color: palette.muted, fontSize: 7, marginTop: 2 },
  cardShell: { width: '100%', maxWidth: 470, borderRadius: 31, padding: 1, backgroundColor: '#FFFFFFC7', shadowColor: palette.brandDark, shadowOpacity: 0.13, shadowRadius: 38, shadowOffset: { width: 0, height: 22 }, elevation: 12, overflow: 'hidden' },
  cardHighlight: { position: 'absolute', top: -50, right: -50, width: 170, height: 120, borderRadius: 80, backgroundColor: '#FFFFFF9E', transform: [{ rotate: '-20deg' }] },
  card: { backgroundColor: palette.surface, borderRadius: 30, borderWidth: 1, borderColor: '#FFFFFFE8', padding: 29 },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF85', borderRadius: 14, padding: 4, marginBottom: 27, borderWidth: 1, borderColor: palette.line },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  tabActive: { backgroundColor: '#FFFFFF', shadowColor: palette.ink, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  tabText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: palette.brandDark },
  title: { color: palette.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.9 },
  subtitle: { color: palette.muted, fontSize: 11, lineHeight: 18, marginTop: 7, marginBottom: 23 },
  field: { marginBottom: 14 },
  label: { color: palette.ink, fontSize: 9, fontWeight: '800', marginBottom: 7, letterSpacing: 0.2 },
  inputShell: { minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFFA8', borderWidth: 1, borderColor: palette.line, borderRadius: 14, paddingLeft: 14 },
  input: { flex: 1, minHeight: 48, color: palette.ink, fontSize: 12, paddingVertical: 0 },
  visibilityButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
  visibilityText: { color: palette.brandDark, fontSize: 9, fontWeight: '900' },
  forgotButton: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 13, paddingVertical: 4 },
  forgotText: { color: palette.brandDark, fontSize: 9, fontWeight: '800' },
  submitButton: { height: 52, borderRadius: 15, backgroundColor: palette.brand, alignItems: 'center', justifyContent: 'center', marginTop: 5, shadowColor: palette.brand, shadowOpacity: 0.25, shadowRadius: 13, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  submitText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  errorBox: { backgroundColor: palette.redPale, borderRadius: 11, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: `${palette.red}22` },
  errorText: { color: palette.red, fontSize: 10, lineHeight: 15 },
  messageBox: { backgroundColor: palette.brandPale, borderRadius: 11, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: `${palette.brand}22` },
  messageText: { color: palette.brandDark, fontSize: 10, lineHeight: 15 },
  backButton: { alignSelf: 'center', padding: 10, marginTop: 7 },
  backText: { color: palette.muted, fontSize: 9, fontWeight: '800' },
  demoSection: { borderTopWidth: 1, borderTopColor: palette.line, marginTop: 22, paddingTop: 18 },
  demoTitle: { color: palette.ink, fontSize: 11, fontWeight: '900' },
  demoText: { color: palette.muted, fontSize: 9, lineHeight: 15, marginTop: 5 },
  demoButton: { height: 43, borderRadius: 12, backgroundColor: palette.amberPale, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  demoButtonText: { color: palette.amber, fontSize: 10, fontWeight: '900' },
  securityNote: { color: palette.muted, fontSize: 8, textAlign: 'center', letterSpacing: 0.3 },
});
