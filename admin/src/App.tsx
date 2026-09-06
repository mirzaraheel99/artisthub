import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Artists } from './pages/Artists';
import { ArtistDetail } from './pages/ArtistDetail';
import { Rewards } from './pages/Rewards';
import { Points } from './pages/Points';
import { Card, Button, Spinner } from './components/ui';

function Gate() {
  const { session, isAdmin, loading, signOut } = useAuth();

  if (loading) return <Spinner label="Checking access…" />;
  if (!session) return <Login />;

  // The UI check is a courtesy. RLS is what actually stops a non-admin from
  // reading or writing anything here — see infra/supabase/migrations/0003_rls.sql.
  if (!isAdmin) {
    return (
      <div className="flex min-h-full items-center justify-center px-4">
        <Card className="max-w-sm text-center">
          <h1 className="font-display text-xl text-ink-200">Not an admin</h1>
          <p className="mt-2 text-sm text-ink-400">
            This account exists but doesn't have the admin role. An existing admin has to grant it, or run{' '}
            <code className="text-gold-500">promote_to_admin()</code> on the server.
          </p>
          <Button variant="ghost" className="mt-4" onClick={signOut}>
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="artists" element={<Artists />} />
        <Route path="artists/:artistId" element={<ArtistDetail />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="points" element={<Points />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
