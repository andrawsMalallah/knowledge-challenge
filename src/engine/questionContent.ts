/** Existing saved games may retain optional explanation text from older content. */
export function validOptionalExplanation(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
