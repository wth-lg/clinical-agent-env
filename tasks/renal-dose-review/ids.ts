// T1's id registry (packages/env/overlay.ts, "Planted ids"): every resource overlay.ts adds,
// by registry key, and the neutral id it has in the world. Graders, solutions and tests name a
// planted resource by key, through id() and ref().
import { planted } from '../../packages/env/planted.ts';

export const IDS = {
  'cond-t1-aki': 'cond-00980',
  'cond-t1-hld': 'cond-00981',
  'cond-t1-pe': 'cond-00982',
  'cond-t1-pe-hx': 'cond-00983',
  'cond-t1-phn': 'cond-00984',
  'cond-t1-t2dm': 'cond-00985',
  'doc-t1-dc-0212': 'doc-00360',
  'doc-t1-heme-0205': 'doc-00359',
  'doc-t1-pn-0512': 'doc-00361',
  'doc-t1-rx-1021': 'doc-00362',
  'enc-t1-0205': 'enc-00361',
  'enc-t1-0207': 'enc-00362',
  'enc-t1-0512': 'enc-00363',
  'enc-t1-0804': 'enc-00359',
  'enc-t1-0811': 'enc-00360',
  'enc-t1-1020': 'enc-00364',
  'enc-t1-1022': 'enc-00365',
  'mr-t1-apixaban': 'mr-00389',
  'mr-t1-apixaban-10': 'mr-00390',
  'mr-t1-apixaban-5': 'mr-00391',
  'mr-t1-atorvastatin': 'mr-00392',
  'mr-t1-gabapentin': 'mr-00393',
  'mr-t1-metformin': 'mr-00394',
  'obs-t1-scr-0209': 'obs-03458',
  'obs-t1-scr-0512': 'obs-03460',
  'obs-t1-scr-1020': 'obs-03462',
  'obs-t1-scr-1021': 'obs-03463',
  'obs-t1-wt-0210': 'obs-03459',
  'obs-t1-wt-1020': 'obs-03461',
  'obs-t1-wt-1022': 'obs-03464',
  'pr-t1-heme': 'pr-okonkwo-reyes',
  'pr-t1-lindqvist': 'pr-lindqvist',
  'pr-t1-raman': 'pr-raman',
} as const;

export const { id, ref } = planted(IDS);
