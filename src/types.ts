export type Kind = 'photo' | 'chart' | 'decorative';
export type Source = 'device' | 'cloud';

export interface AltResult {
  kind: Kind;
  alt: string;
  longDescription?: string;
}

export type CardStatus = 'pending' | 'working' | 'done' | 'skipped' | 'error';

export interface ImageCard {
  id: string;
  /** file name or the original src of the <img> */
  file: string;
  /** index of the <img> in the pasted HTML, -1 for folder-only input */
  htmlIndex: number;
  blob?: Blob;
  thumbUrl?: string;
  width?: number;
  height?: number;
  mime: string;
  existingAlt?: string;
  kind: Kind;
  alt: string;
  longDescription?: string;
  decorative: boolean;
  approved: boolean;
  source?: Source;
  reason?: string;
  status: CardStatus;
  error?: string;
  /** user asked for this card to go to the cloud */
  forceCloud?: boolean;
}
