/** Contract (PRD §2). Lane A may refine; the ids are frozen. */
import type { SourceDocument, User } from '../domain/types';

export const SEED_USERS: User[] = [
  { id: 'u_dana', name: 'Dana Reyes', email: 'dana@lonestarfleet.example' },
  { id: 'u_bob', name: 'Bob Smith', email: 'bob@acmetrucking.example' },
  { id: 'u_maria', name: 'Maria Lopez', email: 'maria@coastalfreight.example' },
];

export const SEED_SOURCE_ID = 'src_master_agreement';

export const SEED_SOURCES: SourceDocument[] = [
  {
    id: SEED_SOURCE_ID,
    title: 'Lone Star Fleet Services: Master Agreement',
    fileUrl: '/sample/master-agreement.pdf',
    pageCount: 2,
    pageSizes: [
      { widthPt: 612, heightPt: 792 },
      { widthPt: 612, heightPt: 792 },
    ],
  },
];
