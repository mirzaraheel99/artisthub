import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from '../components/ui';
import type { AbuseFlag } from '../lib/types';

type Flag = AbuseFlag;

const EXPLANATIONS: Record<string, string> = {
  staff_self_referral:
    'A staff member scanned a welcome offer that would have confirmed their own referral. ' +
    'The customer was served, but the referral was not confirmed and no points were awarded.',
  rapid_signups: 'Several accounts were created from one device in a short window.',
  shared_ip: 'Several accounts share an IP address.',
};

export function Abuse() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('abuse_flags')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setFlags((data ?? []) as Flag[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (flag: Flag, status: 'dismissed' | 'actioned') => {
    setBusy(flag.id);
    const { error: err } = await supabase
      .from('abuse_flags')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', flag.id);
    if (err) setError(err.message);
    setBusy(null);
    await load();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink-200">Review queue</h1>
      <p className="mt-1 text-sm text-ink-400">
        Suspicious patterns, for a person to judge.
      </p>

      <Card className="mt-4 border-purple-500/40 bg-purple-500/5">
        <p className="text-sm text-ink-200">
          <span className="font-semibold text-purple-500">Nothing here is proof.</span> Households
          share devices and everyone at the lounge shares one Wi-Fi network, so these patterns have
          innocent explanations far more often than not. Banning a real customer costs more than the
          fraud would have — read the detail before acting.
        </p>
      </Card>

      <div className="mt-6">
        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !flags ? (
          <Spinner />
        ) : flags.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            body="Flags appear here when the system spots a pattern worth a human look. An empty queue is the normal state."
          />
        ) : (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li key={flag.id} className="rounded-lg border border-ink-800 bg-ink-900 p-4">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink-200">
                        {flag.flag_type.replace(/_/g, ' ')}
                      </p>
                      <Badge tone={flag.severity === 'high' ? 'gold' : 'neutral'}>
                        {flag.severity}
                      </Badge>
                    </div>

                    <p className="mt-1 text-sm text-ink-400">
                      {EXPLANATIONS[flag.flag_type] ?? 'No description for this flag type.'}
                    </p>

                    <p className="mt-2 font-mono text-xs text-ink-400">
                      {new Date(flag.created_at).toLocaleString()}
                      {flag.user_id ? ` · user ${flag.user_id.slice(0, 8)}…` : ''}
                    </p>

                    <pre className="mt-2 overflow-x-auto rounded bg-ink-850 p-3 font-mono text-[11px] text-ink-400">
                      {JSON.stringify(flag.detail, null, 2)}
                    </pre>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      disabled={busy === flag.id}
                      onClick={() => void resolve(flag, 'dismissed')}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      disabled={busy === flag.id}
                      onClick={() => void resolve(flag, 'actioned')}
                    >
                      Actioned
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
