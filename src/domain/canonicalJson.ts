function encode(value: unknown): string | undefined {
  if (Array.isArray(value)) return `[${value.map((item) => encode(item) ?? 'null').join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .flatMap((key) => {
        const encoded = encode(record[key]);
        return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
      });
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Sorted keys, no whitespace. Undefined members drop out, as they do in a JSON round trip. */
export function canonicalJson(value: unknown): string {
  return encode(value) ?? 'null';
}
