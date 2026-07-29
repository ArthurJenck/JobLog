import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { playToggle, playError } from '@/lib/sound';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

interface Settings {
  email: boolean;
  push: boolean;
  reminderDefaultDays: number;
  hasSubscription: boolean;
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [days, setDays] = useState(7);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/push/subscribe', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: Settings) => { setSettings(data); setDays(data.reminderDefaultDays ?? 7); })
      .catch(() => {});
  }, []);

  async function save(patch: Partial<Settings & { subscription: PushSubscriptionJSON | null }>) {
    const snapshot = settings;
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setIsSaving(true);
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      playError();
      toast.error('Impossible de mettre à jour les notifications');
      setSettings(snapshot);
    } finally {
      setIsSaving(false);
    }
  }

  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return;
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await save({ subscription: sub.toJSON() as PushSubscriptionJSON });
  }

  async function unsubscribePush() {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    }
    await save({ subscription: null });
  }

  if (!settings) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <ToggleRow
        label="Emails de relance"
        description="Reçois un email quand une relance est planifiée."
        enabled={settings.email}
        onChange={(v) => save({ email: v })}
        disabled={isSaving}
      />

      <ToggleRow
        label="Notifications push"
        description="Reçois une notification navigateur (en plus de l'email)."
        enabled={settings.push}
        onChange={(v) => {
          setSettings((prev) => (prev ? { ...prev, push: v } : prev));
          (v ? subscribePush() : unsubscribePush()).catch(() => {
            playError();
            toast.error('Impossible de mettre à jour les notifications push');
            setSettings((prev) => (prev ? { ...prev, push: !v } : prev));
          });
        }}
        disabled={isSaving || !VAPID_PUBLIC_KEY}
      />

      <div className="flex flex-col gap-2">
        <Label>Fréquence de relance par défaut (jours)</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 h-9"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => save({ reminderDefaultDays: days })}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, enabled, onChange, disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={() => {
          playToggle();
          onChange(!enabled);
        }}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
          enabled ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transform transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
