import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, RoleCode } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Spinner } from '../components/ui';

type Row = Profile & { roles: RoleCode[]; confirmed: number; pending: number };

const ASSIGNABLE: RoleCode[] = ['staff', 'artist', 'admin'];

export function Users() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    const [profiles, roles, referrals] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('user_roles').select('user_id, role_code'),
      supabase.from('referrals').select('referrer_id, status'),
    ]);

    const failure = profiles.error ?? roles.error ?? referrals.error;
    if (failure) {
      setError(failure.message);
      return;
    }

    const roleMap = new Map<string, RoleCode[]>();
    for (const r of roles.data ?? []) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role_code as RoleCode]);
    }

    const tally = new Map<string, { confirmed: number; pending: number }>();
    for (const r of referrals.data ?? []) {
      const current = tally.get(r.referrer_id) ?? { confirmed: 0, pending: 0 };
      if (r.status === 'confirmed') current.confirmed += 1;
      if (r.status === 'pending') current.pending += 1;
      tally.set(r.referrer_id, current);
    }

    setRows(
      (profiles.data ?? []).map((p) => ({
        ...p,
        roles: roleMap.get(p.id) ?? [],
        confirmed: tally.get(p.id)?.confirmed ?? 0,
        pending: tally.get(p.id)?.pending ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.display_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.referral_code.toLowerCase().includes(q) ||
        r.phone_e164?.includes(q),
    );
  }, [rows, query]);

  const leaderboard = useMemo(
    () => (rows ?? []).filter((r) => r.confirmed > 0).sort((a, b) => b.confirmed - a.confirmed).slice(0, 10),
    [rows],
  );

  const toggleRole = async (row: Row, role: RoleCode) => {
    setBusy(row.id);
    const has = row.roles.includes(role);

    const { error: err } = has
      ? await supabase.from('user_roles').delete().eq('user_id', row.id).eq('role_code', role)
      : await supabase.from('user_roles').insert({ user_id: row.id, role_code: role });

    if (err) setError(err.message);
    setBusy(null);
    await load();
  };

  const toggleBan = async (row: Row) => {
    if (!row.is_banned) {
      const reason = window.prompt(
        `Ban ${row.display_name ?? row.email ?? 'this account'}?\n\n` +
          `They lose every role immediately and cannot redeem. Their existing rewards stay ` +
          `on record.\n\nReason (kept in the audit log):`,
      );
      if (reason === null) return;

      setBusy(row.id);
      const { error: err } = await supabase
        .from('profiles')
        .update({ is_banned: true, ban_reason: reason || 'No reason given', banned_at: new Date().toISOString() })
        .eq('id', row.id);
      if (err) setError(err.message);
    } else {
      setBusy(row.id);
      const { error: err } = await supabase
        .from('profiles')
        .update({ is_banned: false, ban_reason: null, banned_at: null })
        .eq('id', row.id);
      if (err) setError(err.message);
    }
    setBusy(null);
    await load();
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-ink-200">Users</h1>
      <p className="mt-1 text-sm text-ink-400">
        Referral counts are confirmed visits, not installs — a pending referral has signed up but
        not yet claimed their welcome offer.
      </p>

      {leaderboard.length > 0 ? (
        <Card className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Top referrers
          </p>
          <ol className="mt-3 space-y-1.5">
            {leaderboard.map((row, index) => (
              <li key={row.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right font-mono text-xs text-ink-400">{index + 1}</span>
                <span className="flex-1 truncate text-ink-200">
                  {row.display_name ?? row.email ?? row.referral_code}
                </span>
                <span className="font-mono tabular-nums text-gold-500">{row.confirmed}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="mt-6">
        <Input
          placeholder="Search by name, email, phone or referral code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !filtered ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query ? 'No matches' : 'No users yet'}
            body={
              query
                ? 'Nothing matched that search.'
                : 'Users appear here as soon as people start signing up in the app.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-ink-800 bg-ink-900 p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-ink-200">
                        {row.display_name ?? 'No name'}
                      </p>
                      {row.is_banned ? <Badge tone="gold">Banned</Badge> : null}
                      {row.roles
                        .filter((r) => r !== 'fan')
                        .map((r) => (
                          <Badge key={r} tone="purple">
                            {r}
                          </Badge>
                        ))}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-400">
                      {row.email ?? row.phone_e164 ?? 'No contact'} ·{' '}
                      <span className="font-mono text-gold-500">{row.referral_code}</span> ·{' '}
                      {row.phone_verified_at ? 'phone verified' : 'phone unverified'}
                    </p>
                    <p className="mt-1 font-mono text-xs text-ink-400 tabular-nums">
                      {row.confirmed} confirmed · {row.pending} pending
                    </p>
                    {row.is_banned && row.ban_reason ? (
                      <p className="mt-1 text-xs text-danger-500">{row.ban_reason}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {ASSIGNABLE.map((role) => (
                      <Button
                        key={role}
                        variant={row.roles.includes(role) ? 'secondary' : 'ghost'}
                        className="px-2.5 py-1 text-xs"
                        disabled={busy === row.id}
                        onClick={() => void toggleRole(row, role)}
                      >
                        {role}
                      </Button>
                    ))}
                    <Button
                      variant="danger"
                      className="px-2.5 py-1 text-xs"
                      disabled={busy === row.id}
                      onClick={() => void toggleBan(row)}
                    >
                      {row.is_banned ? 'Unban' : 'Ban'}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
