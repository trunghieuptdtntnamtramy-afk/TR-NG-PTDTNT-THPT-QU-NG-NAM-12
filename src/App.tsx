import { useCallback, useEffect, useState } from 'react';
import { AdminWorkspace } from './components/AdminWorkspace';
import { LandingAuthView } from './components/LandingAuthView';
import { StudentWorkspace } from './components/StudentWorkspace';
import { TeacherWorkspace } from './components/TeacherWorkspace';
import { apiRequest } from './lib/api';
import type { PublicOverview, UserProfile } from './types';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [overview, setOverview] = useState<PublicOverview | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await apiRequest<PublicOverview>('/api/public/overview');
      setOverview(data);
    } catch {
      // Keep current overview state if request fails transiently
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleAuthenticated = (newToken: string, loggedInUser: UserProfile) => {
    setToken(newToken);
    setUser(loggedInUser);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST', token });
      } catch {
        // Proceed with local sign-out even if server session already expired
      }
    }
    setToken(null);
    setUser(null);
    void loadOverview();
  };

  if (token && user) {
    if (user.role === 'admin') {
      return <AdminWorkspace user={user} token={token} onLogout={() => void handleLogout()} />;
    }
    if (user.role === 'teacher') {
      return <TeacherWorkspace user={user} token={token} onLogout={() => void handleLogout()} />;
    }
    return <StudentWorkspace user={user} token={token} onLogout={() => void handleLogout()} />;
  }

  return (
    <LandingAuthView
      overview={overview}
      onRefreshOverview={() => void loadOverview()}
      onAuthenticated={handleAuthenticated}
    />
  );
}
