import { buildMainMenu, type PlayerRole } from '../../index.js';

export function renderMenu(role: PlayerRole): string {
  return buildMainMenu(role);
}
