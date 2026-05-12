export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object';
}

export function hasStringFields(record: UnknownRecord, fields: string[]): boolean {
  return fields.every((field) => typeof record[field] === 'string');
}

export function hasBooleanFields(record: UnknownRecord, fields: string[]): boolean {
  return fields.every((field) => typeof record[field] === 'boolean');
}

export function hasOptionalStringField(record: UnknownRecord, field: string): boolean {
  return record[field] === undefined || typeof record[field] === 'string';
}
