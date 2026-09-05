import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ' +
    'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500';
  const variants = {
    primary: 'bg-gold-500 text-ink-950 hover:bg-gold-600',
    secondary: 'bg-purple-500 text-white hover:bg-purple-600',
    ghost: 'bg-ink-800 text-ink-200 hover:bg-ink-700',
    danger: 'bg-transparent text-danger-500 border border-danger-500/40 hover:bg-danger-500/10',
  } as const;
  return <button className={cx(base, variants[variant], className)} {...rest} />;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger-500">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-200 ' +
  'placeholder:text-ink-400/60 focus:border-gold-500 focus:outline-none';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputClass, 'min-h-28 resize-y', className)} {...rest} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-lg border border-ink-800 bg-ink-900 p-5', className)}>{children}</div>;
}

/** One component for every "nothing here yet" case, so empty states are
 *  consistent instead of each page inventing its own. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-700 px-6 py-14 text-center">
      <p className="font-display text-lg text-ink-200">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger-500/40 bg-danger-500/5 px-5 py-4">
      <p className="text-sm font-semibold text-danger-500">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-400">{error}</p>
      {onRetry ? (
        <Button variant="ghost" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-ink-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-gold-500" />
      {label}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'purple' }) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-400',
    gold: 'bg-gold-500/15 text-gold-500',
    purple: 'bg-purple-500/15 text-purple-500',
  } as const;
  return (
    <span className={cx('rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}
