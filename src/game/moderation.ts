export type ModerationFlags = {
  antiSpam: boolean;
  antiFlood: boolean;
  antiLink: boolean;
  antiRaid: boolean;
  antiBadWord: boolean;
  antiInsult: boolean;
  antiTag: boolean;
  welcome: boolean;
  goodbye: boolean;
};

export function createModerationFlags(): ModerationFlags {
  return {
    antiSpam: false,
    antiFlood: false,
    antiLink: false,
    antiRaid: false,
    antiBadWord: false,
    antiInsult: false,
    antiTag: false,
    welcome: false,
    goodbye: false
  };
}

export function setModerationFlag(flags: ModerationFlags, name: keyof ModerationFlags, enabled: boolean): ModerationFlags {
  flags[name] = enabled;
  return flags;
}
