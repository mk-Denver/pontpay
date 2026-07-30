/**
 * RelaySelector — shared relay selection UI for discovery pages.
 * Shows default relays + user's configured read relays as toggleable pills,
 * plus an input to add custom relay URLs.
 *
 * Stores the selected relays in localStorage so both agents and escrows
 * discovery pages share the same relay selection.
 */

import { useState } from 'react';
import { CheckCircle2, Plus, X, Radio } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';

const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
];

export function useDiscoveryRelays() {
  const { config } = useAppContext();
  const userRelays = config.relayMetadata.relays.filter((r) => r.read).map((r) => r.url);
  const available = Array.from(new Set([...DEFAULT_RELAYS, ...userRelays]));

  const [selectedRelays, setSelectedRelays] = useLocalStorage<string[]>('pontpay-discovery-relays', available);
  const [customRelays, setCustomRelays] = useLocalStorage<string[]>('pontpay-discovery-custom-relays', []);

  const allRelays = Array.from(new Set([...selectedRelays, ...customRelays]));

  const toggleRelay = (url: string) => {
    setSelectedRelays((prev) =>
      prev.includes(url) ? prev.filter((r) => r !== url) : [...prev, url],
    );
  };

  const addCustomRelay = (url: string) => {
    const clean = url.trim();
    if (!clean) return;
    if (!clean.startsWith('wss://') && !clean.startsWith('ws://')) return;
    setCustomRelays((prev) => Array.from(new Set([...prev, clean])));
  };

  const removeCustomRelay = (url: string) => {
    setCustomRelays((prev) => prev.filter((r) => r !== url));
    setSelectedRelays((prev) => prev.filter((r) => r !== url));
  };

  return {
    available,
    selectedRelays: allRelays,
    toggleRelay,
    addCustomRelay,
    removeCustomRelay,
    customRelays,
  };
}

export function RelaySelector() {
  const { available, selectedRelays, toggleRelay, addCustomRelay, removeCustomRelay, customRelays } = useDiscoveryRelays();
  const [customInput, setCustomInput] = useState('');

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-5 w-5" /> Discovery Relays
        </CardTitle>
        <CardDescription>Select which Nostr relays to query for agents and escrows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {available.map((url) => {
            const selected = selectedRelays.includes(url);
            return (
              <button
                key={url}
                type="button"
                onClick={() => toggleRelay(url)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  selected
                    ? 'border-green-600 bg-green-500/10 text-green-700'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {selected && <CheckCircle2 className="h-3 w-3" />}
                {url.replace('wss://', '').replace(/\/$/, '')}
              </button>
            );
          })}
          {customRelays.map((url) => (
            <span
              key={url}
              className="flex items-center gap-1.5 rounded-lg border border-green-600 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-700"
            >
              <CheckCircle2 className="h-3 w-3" />
              {url.replace('wss://', '').replace(/\/$/, '')}
              <button type="button" onClick={() => removeCustomRelay(url)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="wss://relay.example.com"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addCustomRelay(customInput); setCustomInput(''); }
            }}
            className="text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => { addCustomRelay(customInput); setCustomInput(''); }} disabled={!customInput.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
