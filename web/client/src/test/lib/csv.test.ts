import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv.ts';

describe('toCsv', () => {
  it('generates correct CSV format', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const columns = [
      { key: 'name' as const, header: 'Name' },
      { key: 'age' as const, header: 'Age' },
    ];

    const result = toCsv(data, columns);

    expect(result).toBe('Name,Age\nAlice,30\nBob,25');
  });

  it('escapes values containing commas', () => {
    const data = [{ name: 'Doe, John', city: 'New York' }];
    const columns = [
      { key: 'name' as const, header: 'Name' },
      { key: 'city' as const, header: 'City' },
    ];

    const result = toCsv(data, columns);

    expect(result).toBe('Name,City\n"Doe, John",New York');
  });

  it('escapes values containing quotes', () => {
    const data = [{ title: 'The "Great" Gatsby' }];
    const columns = [{ key: 'title' as const, header: 'Title' }];

    const result = toCsv(data, columns);

    expect(result).toBe('Title\n"The ""Great"" Gatsby"');
  });

  it('escapes values containing newlines', () => {
    const data = [{ note: 'Line 1\nLine 2' }];
    const columns = [{ key: 'note' as const, header: 'Note' }];

    const result = toCsv(data, columns);

    expect(result).toBe('Note\n"Line 1\nLine 2"');
  });

  it('handles null and undefined as empty string', () => {
    const data = [{ a: null, b: undefined, c: 'value' }];
    const columns = [
      { key: 'a' as const, header: 'A' },
      { key: 'b' as const, header: 'B' },
      { key: 'c' as const, header: 'C' },
    ];

    const result = toCsv(data, columns);

    expect(result).toBe('A,B,C\n,,value');
  });
});
