// T3's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds,
// by registry key, and the neutral id it has in the world. Graders, solutions and tests name a
// planted resource by key, through id() and ref().
import { planted } from '../../packages/env/planted.ts';

export const IDS = {
  'cond-t3-0794': 'cond-00994',
  'cond-t3-3904': 'cond-00999',
  'cond-t3-5463': 'cond-00993',
  'cond-t3-6027': 'cond-00989',
  'cond-t3-7419': 'cond-01002',
  'cond-t3-9251': 'cond-01001',
  'doc-t3-1856': 'doc-00374',
  'doc-t3-6193': 'doc-00412',
  'enc-t3-2087': 'enc-00386',
  'enc-t3-4609': 'enc-00389',
  'enc-t3-5364': 'enc-00388',
  'enc-t3-7781': 'enc-00387',
  'enc-t3-9902': 'enc-00390',
  'eoc-t3-8215': 'eoc-00001',
  'grp-t3-okafor-crc': 'grp-okafor-crc',
  'mr-t3-1580': 'mr-00413',
  'mr-t3-3318': 'mr-00403',
  'mr-t3-4436': 'mr-00414',
  'mr-t3-7725': 'mr-00415',
  'obs-t3-0632': 'obs-03501',
  'obs-t3-1279': 'obs-03495',
  'obs-t3-2465': 'obs-03500',
  'obs-t3-3906': 'obs-03494',
  'obs-t3-4851': 'obs-03502',
  'obs-t3-5179': 'obs-03503',
  'obs-t3-7342': 'obs-03493',
  'obs-t3-8852': 'obs-03504',
  'org-t3-3147': 'org-cedar-hill',
  'org-t3-5520': 'org-maple-grove',
  'pr-t3-7046': 'pr-tolu-adeyemi',
  'proc-t3-2591': 'proc-01338',
  'proc-t3-4170': 'proc-01337',
  'proc-t3-5032': 'proc-01339',
  'proc-t3-8836': 'proc-01340',
  'sr-t3-6648': 'sr-00003',
} as const;

export const { id, ref } = planted(IDS);
