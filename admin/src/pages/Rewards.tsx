import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatCents, valueRatio } from '../lib/money';
import type { RewardCatalogItem } from '../lib/types';
import { RewardForm } from '../components/RewardForm';
import { Badge, Button, Card, EmptyState, ErrorState, Spinner } from '../components/ui';

type Exposure = { outstanding: number; costCents: number; menuCents: number };

export function Rewards() {
  const [rewards, setRewards] = useState<RewardCatalogItem[] | null>(null);
  const [exposure, setExposure] = useState<Exposure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RewardCatalogItem | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);

    const [catalog, grants] = await Promise.all([
      supabase.from('reward_catalog').select('*').order('sort_order').order('point_cost'),
      // Outstanding liability: issued, not yet redeemed, not voided, not expired.
      // Terms are read off the grant rather than the catalogue, so editing a
      // reward never restates what an already-issued promise costs you.
      supabase
        .from('reward_grants')
        .select('terms_unit_cost_cents, terms_menu_value_cents')
        .is('redeemed_at', null)
        .is('voided_at', null)
        .gt('expires_at', new Date().toISOString()),
    ]);

    const failure = catalog.error ?? grants.error;
    if (failure) {
      setError(failure.message);
      return;
    }

    setRewards(catalog.data ?? []);
    setExposure(
      (grants.data ?? []).reduce<Exposure>(
        (acc, g) => ({
          outstanding: acc.outstanding + 1,
          costCents: acc.costCents + g.terms_unit_cost_cents,
          menuCents: acc.menuCents + g.terms_menu_value_cents,
        }),
        { outstanding: 0, costCents: 0, menuCents: 0 },
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (reward: RewardCatalogItem) => {
    // Deactivating stops new issuance. Grants already in fans' hands keep their
    // own terms and stay redeemable — that is deliberate, not an oversight.
    const { error: err } = await supabase
      .from('reward_catalog')
      .update({ is_active: !reward.is_active })
      .eq('id', reward.id);
    if (err) setError(err.message);
    await load();
  };

  if (editing) {
    return (
      <RewardForm
        reward={editing === 'new' ? null : editing}
        onDone={async () => {
          setEditing(null);
          await load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink-200">Rewards</h1>
          <p className="mt-1 text-sm text-ink-400">
            What points buy, and every guardrail that keeps it affordable.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>Add reward</Button>
      </div>

      {exposure ? (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Outstanding rewards
            </p>
            <p className="font-display mt-2 text-3xl tabular-nums text-ink-200">
              {exposure.outstanding}
            </p>
            <p className="mt-1 text-xs text-ink-400">Issued, unredeemed, not yet expired</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Cost exposure
            </p>
            <p className="font-display mt-2 text-3xl tabular-nums text-gold-500">
              {formatCents(exposure.costCents)}
            </p>
            <p className="mt-1 text-xs text-ink-400">If every one of them is redeemed</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Perceived value out
            </p>
            <p className="font-display mt-2 text-3xl tabular-nums text-purple-500">
              {formatCents(exposure.menuCents)}
            </p>
            <p className="mt-1 text-xs text-ink-400">What fans think they are holding</p>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        {error ? (
          <ErrorState error={error} onRetry={() => void load()} />
        ) : !rewards ? (
          <Spinner />
        ) : rewards.length === 0 ? (
          <EmptyState
            title="No rewards yet"
            body="Add at least a welcome offer — redeeming it is what confirms a referral, so the referral loop cannot close without one."
            action={<Button onClick={() => setEditing('new')}>Add reward</Button>}
          />
        ) : (
          <ul className="space-y-2">
            {rewards.map((reward) => (
              <li
                key={reward.id}
                className="flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-200">{reward.name}</p>
                    {reward.is_welcome_offer ? <Badge tone="purple">Welcome offer</Badge> : null}
                    {reward.is_repeatable ? <Badge>Repeatable</Badge> : null}
                    {!reward.is_active ? <Badge>Inactive</Badge> : null}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-400">
                    <span className="tabular-nums">{reward.point_cost} pts</span>
                    <span className="tabular-nums">
                      {formatCents(reward.menu_value_cents)} value / {formatCents(reward.unit_cost_cents)} cost
                    </span>
                    <span className="text-gold-500">
                      {valueRatio(reward.menu_value_cents, reward.unit_cost_cents)}
                    </span>
                    <span>{reward.validity_days}d expiry</span>
                    <span>{reward.requires_purchase ? 'purchase required' : 'no purchase needed'}</span>
                    {reward.monthly_issue_cap ? <span>cap {reward.monthly_issue_cap}/mo</span> : null}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(reward)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => void toggleActive(reward)}
                  >
                    {reward.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
