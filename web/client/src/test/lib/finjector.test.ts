import { describe, expect, it } from 'vitest';
import { buildFinjectorUrl } from '@/lib/finjector.ts';

describe('buildFinjectorUrl', () => {
  it('builds a PPM chart-string URL with the placeholder expenditure type', () => {
    expect(buildFinjectorUrl('FPAENM2341', 'BIOIDV', 'AENM002')).toBe(
      'https://finjector.ucdavis.edu/details/FPAENM2341-BIOIDV-AENM002-522201/'
    );
  });

  it('returns null when a required segment is missing', () => {
    expect(buildFinjectorUrl('FPAENM2341', null, 'AENM002')).toBeNull();
    expect(buildFinjectorUrl('', 'BIOIDV', 'AENM002')).toBeNull();
    expect(buildFinjectorUrl('FPAENM2341', 'BIOIDV', undefined)).toBeNull();
  });
});
