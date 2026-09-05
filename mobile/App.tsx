import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from './src/lib/session';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { ArtistProfileScreen } from './src/screens/ArtistProfileScreen';
import type { RootStackParamList } from './src/navigation';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme: Theme = {
  dark: true,
  colors: {
    primary: colors.gold,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.purple,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              // Keeps the artist photo continuous between the grid card and the
              // profile hero, which is what makes the transition read as
              // shared-element rather than a page swap.
              animation: 'fade_from_bottom',
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="Discover" component={DiscoverScreen} />
            <Stack.Screen name="ArtistProfile" component={ArtistProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
