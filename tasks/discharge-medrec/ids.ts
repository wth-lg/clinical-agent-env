// T4's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds,
// by registry key, and the neutral id it has in the world. Graders, solutions and tests name a
// planted resource by key, through id() and ref().
import { planted } from '../../packages/env/planted.ts';

export const IDS = {
  'cond-t4-aki': 'cond-00986',
  'cond-t4-hf': 'cond-00987',
  'cond-t4-hld': 'cond-00988',
  'doc-t4-dc-1019': 'doc-00364',
  'doc-t4-dc-1019-add': 'doc-00365',
  'doc-t4-dc-2025': 'doc-00363',
  'doc-t4-lab-1021': 'doc-00366',
  'enc-t4-adm-1014': 'enc-00367',
  'enc-t4-adm-2025': 'enc-00366',
  'mr-t4-aspirin': 'mr-00395',
  'mr-t4-atorvastatin': 'mr-00396',
  'mr-t4-furosemide': 'mr-00397',
  'mr-t4-kcl': 'mr-00398',
  'mr-t4-lisinopril': 'mr-00399',
  'mr-t4-metoprolol-succ': 'mr-00400',
  'mr-t4-metoprolol-tart': 'mr-00401',
  'mr-t4-omeprazole': 'mr-00402',
  'obs-t4-scr-1016': 'obs-03465',
  'org-t4-northgate': 'org-northgate',
  'pr-t4-boateng': 'pr-boateng',
} as const;

export const { id, ref } = planted(IDS);
