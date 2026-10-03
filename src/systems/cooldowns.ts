/** Simple in-memory cooldown map used by commandRegistry. */
export class CooldownManager {
  private map = new Map<string, number>();

  has(key: string): boolean {
    const until = this.map.get(key) || 0;
    if (Date.now() >= until) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  set(key: string, durationMs: number): void {
    this.map.set(key, Date.now() + Math.max(0, durationMs));
  }

  remaining(key: string): number {
    return Math.max(0, (this.map.get(key) || 0) - Date.now());
  }

  clear(key?: string): void {
    if (key) this.map.delete(key);
    else this.map.clear();
  }
}
