import { describe, it, expect } from 'vitest';
import { queryRows, DecodedRow } from '../core/isarDatabase';

describe('DataTable search and paste handling', () => {
  const mockRows: DecodedRow[] = [
    {
      id: 1n,
      idLabel: '1',
      rawBytes: new Uint8Array(),
      fields: { name: 'admin_user', email: 'admin@studio.id', role: 'Super Admin' },
      links: {},
    },
    {
      id: 2n,
      idLabel: '2',
      rawBytes: new Uint8Array(),
      fields: { name: 'john_doe', email: 'john@example.com', role: 'Developer' },
      links: {},
    },
    {
      id: 3n,
      idLabel: '3',
      rawBytes: new Uint8Array(),
      fields: { name: 'jane_smith', email: 'jane@example.com', role: 'Designer' },
      links: {},
    },
  ];

  it('filters correctly when text is typed or pasted with leading/trailing whitespace or newlines', () => {
    // Simulating pasted text with newlines or spaces e.g. " admin@studio.id \n"
    const pastedSearch = ' admin@studio.id \n';
    const results = queryRows(mockRows, pastedSearch.replace(/[\r\n]+/g, ' ').trim(), [], null);
    expect(results.length).toBe(1);
    expect(results[0].idLabel).toBe('1');
  });

  it('preserves search results across row data updates (simulating live watch reloads)', () => {
    const search = 'admin';
    const initialResults = queryRows(mockRows, search, [], null);
    expect(initialResults.length).toBe(1);

    // Simulated new incoming row from Flutter live-watch
    const updatedRows: DecodedRow[] = [
      ...mockRows,
      {
        id: 4n,
        idLabel: '4',
        rawBytes: new Uint8Array(),
        fields: { name: 'admin_backup', email: 'backup@studio.id', role: 'Admin Assistant' },
        links: {},
      },
    ];

    // Search query remains active on updated rows
    const liveResults = queryRows(updatedRows, search, [], null);
    expect(liveResults.length).toBe(2);
    expect(liveResults.map((r) => r.idLabel)).toEqual(['1', '4']);
  });
});
