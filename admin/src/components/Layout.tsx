import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './ui';
import { brand } from '../lib/brand';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/artists', label: 'Artists' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/points', label: 'Earning' },
  { to: '/users', label: 'Users' },
  { to: '/review', label: 'Review queue' },
];

export function Layout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-900 px-4 py-6">
        <div className="px-2">
          <p className="font-display text-lg leading-none text-gold-500">{brand.wordmark}</p>
          <p className="mt-1 text-[11px] uppercase tracking-widest text-ink-400">Admin</p>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-ink-800 text-gold-500' : 'text-ink-400 hover:bg-ink-850 hover:text-ink-200'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto px-1">
          <p className="truncate text-xs text-ink-400">{profile?.email ?? profile?.display_name ?? 'Signed in'}</p>
          <Button variant="ghost" className="mt-2 w-full text-xs" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
