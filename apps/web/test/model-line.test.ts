// The run's model and effort line (P17j JU8, verifier-phase-P17i-JU8-1 F3): summary.json's model
// and effort when the records share one; "(the trials differ)" when records set different values;
// "not recorded" when no record sets the field, which summary.json's null does not tell apart.
import { describe, expect, it } from 'vitest';
import { modelLine } from '../src/data/model.ts';

// A record that leaves effort out when it is not given, as records that predate effort do.
const rec = (model_requested: string, effort?: string | null) => ({ record: effort === undefined ? { model_requested } : { model_requested, effort } });

describe('modelLine', () => {
  it('names the model and effort every record shares', () => {
    expect(modelLine({ model: 'claude-opus-5-5', effort: 'high' }, [rec('claude-opus-5-5', 'high')])).toBe('Model claude-opus-5-5, effort high');
  });

  it('says the trials differ when records set different values', () => {
    expect(modelLine({ model: 'claude-opus-5-5', effort: null }, [rec('claude-opus-5-5', 'high'), rec('claude-opus-5-5', 'low')])).toBe('Model claude-opus-5-5, effort (the trials differ)');
  });

  it('says not recorded when no record sets the field', () => {
    expect(modelLine({ model: 'claude-opus-5-5', effort: null }, [rec('claude-opus-5-5'), rec('claude-opus-5-5', null)])).toBe('Model claude-opus-5-5, effort not recorded');
    expect(modelLine({ model: null, effort: null }, [])).toBe('Model not recorded, effort not recorded');
  });
});
