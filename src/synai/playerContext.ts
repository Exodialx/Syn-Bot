/**
 * Pull ONLY relevant live player/game facts for the current question.
 * Never dumps full player JSON; never other players' private data.
 */
import type { Player } from '../game/player.js';

export function buildSyndicatesContext(player: Player, question: string): string[] {
  const q = (question || '').toLowerCase();
  const facts: string[] = [];

  const wantsMoney = /\b(money|cash|balance|bank|rich|broke|afford|cost|price|\$)\b/.test(q);
  const wantsLevel = /\b(level|xp|rank|progress)\b/.test(q);
  const wantsCar =
    /\b(car|cars|garage|vehicle|vehicles|repair|condition|hypercar|drive)\b/.test(q);
  const wantsRole = /\b(role|class|mafia|hitman|businessman)\b/.test(q);
  const wantsHeat = /\b(heat|wanted|jail|prison|cops)\b/.test(q);
  const wantsBiz = /\b(business|biz|front|collect|launder)\b/.test(q);

  if (wantsMoney) {
    facts.push(
      `Your cash: $${Number(player.cash || 0).toLocaleString()} · bank: $${Number(player.bank || 0).toLocaleString()}`
    );
  }
  if (wantsLevel) {
    facts.push(`Your level: ${player.level} · class level: ${player.classLevel} · XP: ${player.xp}`);
  }
  if (wantsRole) {
    facts.push(`Your role: ${player.role || 'Unassigned'}`);
  }
  if (wantsHeat) {
    facts.push(
      `Heat: ${player.heat} · wanted: ${player.wanted}${player.inPrison ? ' · IN PRISON' : ''}`
    );
  }
  if (wantsBiz) {
    facts.push(`Businesses owned: ${(player.businesses || []).length}`);
  }
  if (wantsCar) {
    try {
      const vehicles = (player as any).vehicles || [];
      const state = (player as any).vehicleState || {};
      const activeId = (player as any).activeVehicleId;
      const active = (activeId && state[activeId]) || (vehicles[0] && state[vehicles[0]]);
      if (!vehicles.length) {
        facts.push('Garage: empty — browse with .vehicle shop');
      } else if (active) {
        facts.push(
          `Main car: ${active.name} · condition ${Number(active.condition || 0).toFixed(0)}% · mileage ${Number(active.mileage || 0).toFixed(0)} km`
        );
        facts.push(`Garage slots used: ${vehicles.length}`);
      } else {
        facts.push(`Garage has ${vehicles.length} vehicle(s) — .vehicle for details`);
      }
    } catch {
      /* ignore */
    }
  }

  // Identity line only when we already inject something personal
  if (facts.length && player.usernameSet && player.name) {
    facts.unshift(`Player: ${player.name}`);
  }

  return facts;
}
