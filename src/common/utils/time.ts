export const nowIso = (): string => new Date().toISOString();

export const addMinutes = (input: Date, minutes: number): string =>
  new Date(input.getTime() + minutes * 60_000).toISOString();
