import { Stack } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureRequestIdGenerator, createOdinClient, type OdinSupabaseClient } from '@odin/data';

import { OdinProvider } from '../src/state/OdinProvider.tsx';
import { InvalidEnvError, MissingEnvError, readEnv } from '../src/env.ts';
import { createSecureSessionStorage } from '../src/session-storage.ts';

/**
 * Root layout. The Supabase client is built once, with the native secure-store
 * session adapter injected; there is no URL to parse on Android, so session
 * detection from a URL stays off.
 */

type Bootstrap =
  | { readonly ok: true; readonly client: OdinSupabaseClient }
  | { readonly ok: false; readonly variables: readonly string[]; readonly detail: string };

function bootstrap(): Bootstrap {
  try {
    configureRequestIdGenerator(randomUUID);
    const env = readEnv();
    return {
      ok: true,
      client: createOdinClient(
        { url: env.supabaseUrl, publishableKey: env.supabasePublishableKey },
        { storage: createSecureSessionStorage(), detectSessionInUrl: false },
      ),
    };
  } catch (cause) {
    if (cause instanceof MissingEnvError) {
      return {
        ok: false,
        variables: cause.missing,
        detail:
          'This build is missing required client configuration. Set the following variables and rebuild.',
      };
    }
    if (cause instanceof InvalidEnvError) {
      return {
        ok: false,
        variables: [cause.variable],
        detail: `This build has invalid client configuration (${cause.reason}). Correct the following variable and rebuild.`,
      };
    }
    throw cause;
  }
}

const started = bootstrap();

function ConfigurationRequired({
  variables,
  detail,
}: {
  readonly variables: readonly string[];
  readonly detail: string;
}): ReactNode {
  return (
    <View style={styles.configScreen}>
      <Text accessibilityRole="header" style={styles.configTitle}>
        Configuration required
      </Text>
      <Text style={styles.configBody}>{detail}</Text>
      {variables.map((name) => (
        <Text key={name} style={styles.configCode}>
          {name}
        </Text>
      ))}
    </View>
  );
}

export default function RootLayout(): ReactNode {
  if (!started.ok) {
    return <ConfigurationRequired detail={started.detail} variables={started.variables} />;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <OdinProvider client={started.client}>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </OdinProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  configBody: { fontSize: 15, textAlign: 'center' },
  configCode: { fontFamily: 'monospace', fontSize: 14 },
  configScreen: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  configTitle: { fontSize: 22, fontWeight: '700' },
  root: { flex: 1 },
});
