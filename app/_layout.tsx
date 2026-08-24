import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSfx } from '../src/engine/sfx';
import { CONFIG } from '../src/game/config';

export default function RootLayout() {
  // Preload every sound at boot so the first play is instant.
  useEffect(() => {
    initSfx();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: CONFIG.colors.bg },
        }}
      />
    </>
  );
}
