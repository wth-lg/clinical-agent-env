// T5's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds,
// by registry key, and the neutral id it has in the world. Graders, solutions and tests name a
// planted resource by key, through id() and ref().
import { planted } from '../../packages/env/planted.ts';

export const IDS = {
  'alg-t5-iohexol': 'alg-00043',
  'alg-t5-pvp': 'alg-00042',
  'alg-t5-shellfish': 'alg-00041',
  'appt-t5-1026': 'appt-00001',
  'cond-t5-pcyst': 'cond-00991',
  'cond-t5-t2dm': 'cond-00992',
  'doc-t5-ct-2019': 'doc-00369',
  'doc-t5-ct-2023': 'doc-00370',
  'doc-t5-ed-1017': 'doc-00373',
  'doc-t5-tel-0922': 'doc-00371',
  'doc-t5-tel-1009': 'doc-00372',
  'enc-t5-0514': 'enc-00374',
  'enc-t5-0612': 'enc-00375',
  'enc-t5-0620': 'enc-00376',
  'enc-t5-0814': 'enc-00377',
  'enc-t5-ed-1016': 'enc-00378',
  'mr-t5-dph-2023': 'mr-00406',
  'mr-t5-metformin': 'mr-00407',
  'mr-t5-pred-2023': 'mr-00405',
  'obs-t5-a1c-0420': 'obs-03486',
  'obs-t5-a1c-0814': 'obs-03484',
  'obs-t5-scr-0612': 'obs-03483',
  'obs-t5-scr-0814': 'obs-03485',
  'obs-t5-scr-0924': 'obs-03487',
  'org-t5-harbor': 'org-harbor',
  'pr-t5-adeyemi': 'pr-tunde-adeyemi',
  'pr-t5-castellano': 'pr-castellano',
  'sr-t5-cmp-0420': 'sr-00002',
} as const;

export const { id, ref } = planted(IDS);
