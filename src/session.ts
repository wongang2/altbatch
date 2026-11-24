import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, limit, serverTimestamp } from 'firebase/firestore';
import type { Backend } from './firebase';
import type { ImageCard, Kind, Source } from './types';

/** Text only. Images are never stored. */
export interface SavedItem {
  file: string;
  alt: string;
  kind: Kind;
  source: Source | '';
  reason: string;
}

export function toSavedItems(cards: ImageCard[]): SavedItem[] {
  return cards.map((c) => ({
    file: c.file,
    alt: c.decorative ? '' : c.alt,
    kind: c.decorative ? 'decorative' : c.kind,
    source: c.source ?? '',
    reason: c.reason ?? '',
  }));
}

const sessions = (b: Backend) => collection(b.db, 'users', b.user!.uid, 'sessions');

export async function saveSession(b: Backend, cards: ImageCard[]): Promise<string> {
  if (!b.user) throw new Error('Not signed in');
  const ref = await addDoc(sessions(b), { createdAt: serverTimestamp(), items: toSavedItems(cards) });
  return ref.id;
}

export async function listSessions(b: Backend): Promise<{ id: string; count: number }[]> {
  if (!b.user) return [];
  const snap = await getDocs(query(sessions(b), orderBy('createdAt', 'desc'), limit(10)));
  return snap.docs.map((d) => ({ id: d.id, count: (d.data().items as unknown[] | undefined)?.length ?? 0 }));
}

export async function loadSession(b: Backend, id: string): Promise<SavedItem[]> {
  if (!b.user) return [];
  const snap = await getDoc(doc(b.db, 'users', b.user.uid, 'sessions', id));
  return (snap.data()?.items as SavedItem[] | undefined) ?? [];
}
