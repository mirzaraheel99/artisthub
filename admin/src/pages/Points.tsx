import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { PointRule } from '../lib/types';
import { Button, Card, ErrorState, Input, Spinner } from '../components/ui';

export function Points() {
  const [rules, setRules] = useState<PointRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.from('point_rules').select('*').order('code');
    if (err) setError(err.message);
    else {
      setRules(data ?? []);
      setDraft(Object.fromEntries((data ?? []).map((r) => [r.code, String(r.points)])));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (rule: PointRule) => {
    const value = Number(draft[rule.code]);
    if (!Number.isInteger(value) || value < 0) {
      setError(`"${rule.code}" must be a whole number of points, zero or more.`);
      return;
    }
    setSaving(rule.code);
    const { error: err } = await supabase
      .from('point_rules')
      .update({ points: value })
      .eq('code', rule.code);
    if (err) setError(err.message);
    setSaving(null);
    await load();
  };

  const toggle = async (rule: PointRule) => {
    const { error: err } = await supabase
      .from('point_rules')
      .update({ is_active: !rule.is_active })
      .eq('code', rule.code);
    if (err) setError(err.message);
    await load();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink-200">Earning</h1>
      <p className="mt-1 text-sm text-ink-400">
        How fans earn points. Changing a rate takes effect immediately and does not need an app
        release — but it never alters points already awarded.
      </p>

      <Card className="mt-4 border-purple-500/40 bg-purple-500/5">
        <p className="text-sm text-ink-200">
          <span className="font-semibold text-purple-500">Never add a rule that rewards
          listening, watching, or time in the app.</span>{' '}
          Incentivised streams breach Spotify's and YouTube's terms, and enforcement lands on the
          artist's account, not yours. Points come from visits, referrals and events — things that
          happen in the venue.
        </p>
      </Card>

      {error ? (
        <div className="mt-6">
          <ErrorState error={error} onRetry={() => void load()} />
        </div>
      ) : null}

      {!rules ? (
        <Spinner />
      ) : (
        <div className="mt-6 space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.code}
              className="flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-200">{rule.description}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-400">
                  {rule.code}
                  {rule.daily_cap ? ` · max ${rule.daily_cap}×/day` : ' · uncapped'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Input
                  className="w-24 text-right tabular-nums"
                  value={draft[rule.code] ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [rule.code]: e.target.value }))}
                  inputMode="numeric"
                />
                <span className="text-xs text-ink-400">pts</span>
                <Button
                  className="px-3 py-1.5 text-xs"
                  disabled={saving === rule.code || draft[rule.code] === String(rule.points)}
                  onClick={() => void save(rule)}
                >
                  {saving === rule.code ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => void toggle(rule)}
                >
                  {rule.is_active ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
