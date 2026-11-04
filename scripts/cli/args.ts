export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

/**
 * Minimal argv parser - no dependencies on purpose.
 * Supports `--flag`, `--no-flag`, `--key value` and `--key=value`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      if (!command) {
        command = token;
      } else {
        positional.push(token);
      }
      continue;
    }

    const body = token.slice(2);
    const equalsAt = body.indexOf('=');

    if (equalsAt >= 0) {
      flags[body.slice(0, equalsAt)] = body.slice(equalsAt + 1);
      continue;
    }

    if (body.startsWith('no-')) {
      flags[body.slice(3)] = false;
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }

  return { command: command || 'help', flags, positional };
}

export function str(flags: ParsedArgs['flags'], key: string): string | undefined {
  const value = flags[key];
  return typeof value === 'string' ? value : undefined;
}

export function num(flags: ParsedArgs['flags'], key: string): number | undefined {
  const value = str(flags, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function bool(flags: ParsedArgs['flags'], key: string): boolean | undefined {
  const value = flags[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}

export function list(flags: ParsedArgs['flags'], key: string): string[] | undefined {
  const value = str(flags, key);
  if (!value) {
    return undefined;
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}
