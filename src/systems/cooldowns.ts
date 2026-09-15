export type CooldownType = 'player' | 'clan' | 'hourly' | 'daily' | 'global' | 'custom';

export type CooldownEntry = {
  key: string;
  type: CooldownType;
  expiresAt: number;
};

export class CooldownManager {
  private store = new Map<string, CooldownEntry>();

  set(key: string, durationMs: number, type: CooldownType = 'custom'): void {
    this.store.set(key, { key, type, expiresAt: Date.now() + durationMs });
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  clear(key: string): void {
    this.store.delete(key);
  }

  snapshot(): CooldownEntry[] {
    return [...this.store.values()];
  }
}
