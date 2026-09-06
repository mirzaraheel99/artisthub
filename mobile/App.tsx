import 'react-native-gesture-handler';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './src/lib/session';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { ArtistProfileScreen } from './src/screens/ArtistProfileScreen';
import { RewardsScreen } from './src/screens/RewardsScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import type { RootStackParamList, TabParamList } from './src/navigation';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

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

function TabBarIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ color: focused ? colors.gold : colors.textMuted, fontSize: 11, fontWeight: '700' }}>
      {label}
    </Text>
  );
}

function MainTabs() {
  const { isStaff } = useSession();

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarIcon: ({ focused }) => <TabBarIcon label="◆" focused={focused} /> }}
      />
      <Tabs.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ tabBarIcon: ({ focused }) => <TabBarIcon label="★" focused={focused} /> }}
      />
      {/* Hidden for everyone else. The database is what actually refuses a
          non-staff redemption — this only keeps the tab bar honest. */}
      {isStaff ? (
        <Tabs.Screen
          name="Staff"
          component={StaffScreen}
          options={{ tabBarIcon: ({ focused }) => <TabBarIcon label="⌘" focused={focused} /> }}
        />
      ) : null}
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabBarIcon label="●" focused={focused} /> }}
      />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'fade_from_bottom',
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="ArtistProfile" component={ArtistProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
