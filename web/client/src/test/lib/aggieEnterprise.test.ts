import { describe, expect, it } from 'vitest';
import {
  buildAeCostUrl,
  buildAeProjectBudgetUrl,
} from '@/lib/aggieEnterprise.ts';

describe('buildAeCostUrl', () => {
  it('builds the expenditure item deep link from a transaction number', () => {
    expect(buildAeCostUrl(11_687_735)).toBe(
      'https://fa-etfq-saasfaprod1.fa.ocs.oraclecloud.com/fscmUI/faces/deeplink?objType=EXPENDITUREITEMDETAILS&objKey=ExpItemId=11687735&action=EDIT'
    );
  });

  it('returns null when the transaction number is missing', () => {
    expect(buildAeCostUrl(null)).toBeNull();
    expect(buildAeCostUrl(undefined)).toBeNull();
  });
});

describe('buildAeProjectBudgetUrl', () => {
  it('builds the Manage Project Budget deep link from an Oracle project id', () => {
    expect(buildAeProjectBudgetUrl(300_000_014_220_069)).toBe(
      'https://fa-etfq-saasfaprod1.fa.ocs.oraclecloud.com/fscmUI/faces/deeplink?objType=PROJECT&objKey=ProjectId=300000014220069&action=MANAGE_BUDGET'
    );
  });

  it('returns null when the Oracle project id is missing', () => {
    expect(buildAeProjectBudgetUrl(null)).toBeNull();
    expect(buildAeProjectBudgetUrl(undefined)).toBeNull();
  });
});
