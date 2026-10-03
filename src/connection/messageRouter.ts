import { handleCommand } from '../commands/commandRegistry.js';
import { parseCommand } from '../game/commandParser.js';

export type ChatType = 'private' | 'group';

export type ProcessedMessage = {
  senderId: string;
  chatType: ChatType;
  original: string;
  command: string;
  alias: string | null;
  args: string[];
  response: string;
};

export function processIncomingMessage(rawInput: string, senderId: string, chatType: ChatType = 'private'): ProcessedMessage {
  const parsed = parseCommand(rawInput);
  return {
    senderId,
    chatType,
    original: rawInput,
    command: parsed.command,
    alias: parsed.alias,
    args: parsed.args,
    response: handleCommand(rawInput, senderId)
  };
}
