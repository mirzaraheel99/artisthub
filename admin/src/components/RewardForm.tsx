import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { centsToInput, parseDollars, valueRatio, describeWeekdays } from '../lib/money';
import type { BlackoutRule, RewardCatalogItem, Venue } from '../lib/types';
import { Button, Card, Field, Input, Textarea } from './ui';

export function RewardForm({
  reward,
  onDone,
  onCancel,
}: {
  reward: RewardCatalogItem | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(reward?.name ?? '');
  const [description, setDescription] = useState(reward?.description ?? '');
  const [pointCost, setPointCost] = useState(String(reward?.point_cost ?? 0));
  const [unitCost, setUnitCost] = useState(centsToInput(reward?.unit_cost_cents ?? 0));
  const [menuValue, setMenuValue] = useState(centsToInput(reward?.menu_value_cents ?? 0));
  const [requiresPurchase, setRequiresPurchase] = useState(reward?.requires_purchase ?? true);
  const [validityDays, setValidityDays] = useState(String(reward?.validity_days ?? 90));
  const [monthlyCap, setMonthlyCap] = useState(
    reward?.monthly_issue_cap === null || reward?.monthly_issue_cap === undefined
      ? ''
      : String(reward.monthly_issue_cap),
  );
  const [blackoutId, setBlackoutId] = useState<string>(reward?.blackout_rule_id ?? '');
  const [isRepeatable, setIsRepeatable] = useState(reward?.is_repeatable ?? false);
  const [isWelcome, setIsWelcome] = useState(reward?.is_welcome_offer ?? false);
  const [venueIds, setVenueIds] = useState<string[]>([]);

  const [blackouts, setBlackouts] = useState<BlackoutRule[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [b, v] = await Promise.all([
        supabase.from('blackout_rules').select('*').eq('is_active', true),
        supabase.from('venues').select('*').eq('is_active', true).order('name'),
      ]);
      if (cancelled) return;
      setBlackouts(b.data ?? []);
      setVenues(v.data ?? []);

      if (reward) {
        const { data } = await supabase
          .from('reward_venues')
          .select('venue_id')
          .eq('reward_id', reward.id);
        if (!cancelled) setVenueIds((data ?? []).map((r) => r.venue_id));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reward]);

  const unitCents = parseDollars(unitCost);
  const menuCents = parseDollars(menuValue);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (unitCents === null) return setError('Your cost must be a dollar amount, e.g. 3.00');
    if (menuCents === null) return setError('Menu value must be a dollar amount, e.g. 15.99');

    const days = Number(validityDays);
    if (!Number.isInteger(days) || days < 1) return setError('Expiry must be at least 1 day.');

    setBusy(true);
    setError(null);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      point_cost: Number(pointCost) || 0,
      unit_cost_cents: unitCents,
      menu_value_cents: menuCents,
      requires_purchase: requiresPurchase,
      validity_days: days,
      monthly_issue_cap: monthlyCap.trim() === '' ? null : Number(monthlyCap),
      blackout_rule_id: blackoutId || null,
      is_repeatable: isRepeatable,
      is_welcome_offer: isWelcome,
    };

    let rewardId = reward?.id;

    if (reward) {
      const { error: err } = await supabase.from('reward_catalog').update(payload).eq('id', reward.id);
      if (err) return fail(err.message);
    } else {
      const { data, error: err } = await supabase
        .from('reward_catalog')
        .insert(payload)
        .select('id')
        .single();
      if (err) return fail(err.message);
      rewardId = data.id;
    }

    if (!rewardId) return fail('Saved, but no id came back.');

    const { error: delErr } = await supabase.from('reward_venues').delete().eq('reward_id', rewardId);
    if (delErr) return fail(delErr.message);

    if (venueIds.length > 0) {
      const { error: insErr } = await supabase
        .from('reward_venues')
        .insert(venueIds.map((venue_id) => ({ reward_id: rewardId, venue_id })));
      if (insErr) return fail(insErr.message);
    }

    await onDone();

    function fail(message: string) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl text-ink-200">{reward ? 'Edit reward' : 'Add reward'}</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card className="space-y-5">
          <Field label="Name" hint="What the fan sees, and what staff hand over.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Free wings" required />
          </Field>

          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Point cost">
              <Input
                className="tabular-nums"
                value={pointCost}
                onChange={(e) => setPointCost(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Menu value" hint="What the fan perceives">
              <Input
                className="tabular-nums"
                value={menuValue}
                onChange={(e) => setMenuValue(e.target.value)}
                placeholder="15.99"
              />
            </Field>
            <Field label="Your cost" hint="Real food cost">
              <Input
                className="tabular-nums"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="3.00"
              />
            </Field>
          </div>

          {unitCents !== null && menuCents !== null && unitCents > 0 ? (
            <p className="text-sm text-ink-400">
              Perceived-to-cost spread:{' '}
              <span className="font-mono font-semibold text-gold-500">
                {valueRatio(menuCents, unitCents)}
              </span>{' '}
              — this spread is the whole economic argument for the programme.
            </p>
          ) : null}
        </Card>

        <Card className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Guardrails</p>

          <label className="flex items-start gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={requiresPurchase}
              onChange={(e) => setRequiresPurchase(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-gold-500)]"
            />
            <span>
              Requires a purchase
              <span className="mt-0.5 block text-xs text-ink-400">
                Turns a giveaway into a discount on a sale. Nobody walks in, takes it, and leaves.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Expires after (days)" hint="Creates urgency and bounds your liability.">
              <Input
                className="tabular-nums"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Monthly issue cap" hint="Blank means uncapped.">
              <Input
                className="tabular-nums"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(e.target.value)}
                inputMode="numeric"
                placeholder="uncapped"
              />
            </Field>
          </div>

          <Field label="Blackout window" hint="Protects peak nights and pushes redemption to slow ones.">
            <select
              value={blackoutId}
              onChange={(e) => setBlackoutId(e.target.value)}
              className="w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 focus:border-gold-500 focus:outline-none"
            >
              <option value="">No blackout — redeemable any time</option>
              {blackouts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({describeWeekdays(b.weekday_mask)} {b.start_time}–{b.end_time})
                </option>
              ))}
            </select>
          </Field>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              Where it can be redeemed
            </p>
            <p className="mt-1 text-xs text-ink-400">
              Select none to allow every venue. Only do that once a funder is agreed for each one —
              otherwise a benefit you fund is spendable at a partner who never agreed to pay for it.
            </p>
          </div>

          {venues.map((venue) => (
            <label key={venue.id} className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={venueIds.includes(venue.id)}
                onChange={(e) =>
                  setVenueIds((prev) =>
                    e.target.checked ? [...prev, venue.id] : prev.filter((id) => id !== venue.id),
                  )
                }
                className="h-4 w-4 accent-[var(--color-purple-500)]"
              />
              {venue.name}
              <span className="text-xs text-ink-400">{venue.is_owned ? '(ours)' : '(partner)'}</span>
            </label>
          ))}
          {venues.length === 0 ? (
            <p className="text-sm text-ink-400">No venues yet. Add one before issuing rewards.</p>
          ) : null}
        </Card>

        <Card className="space-y-4">
          <label className="flex items-start gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={isRepeatable}
              onChange={(e) => setIsRepeatable(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-gold-500)]"
            />
            <span>
              Repeatable
              <span className="mt-0.5 block text-xs text-ink-400">
                Your best promoters should not hit a ceiling.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={isWelcome}
              onChange={(e) => setIsWelcome(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-purple-500)]"
            />
            <span>
              This is the welcome offer
              <span className="mt-0.5 block text-xs text-ink-400">
                Redeeming it is what confirms a referral. Only one can be active at a time.
              </span>
            </span>
          </label>
        </Card>

        {error ? <p className="text-sm text-danger-500">{error}</p> : null}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : reward ? 'Save changes' : 'Create reward'}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
