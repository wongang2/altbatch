import { createHandles, deviceAvailability, type Handles } from './ai';
import { draftCard, type DraftContext } from './draft';
import { buildCsv, buildHtml, download } from './export';
import { startFirebase, type Backend } from './firebase';
import { isFirebaseConfigured } from './firebase-config';
import { cardsFromFiles, cardsFromHtml } from './input';
import { DEFAULT_TOKEN_MARGIN } from './routing';
import { listSessions, loadSession, saveSession } from './session';
import type { ImageCard } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let cards: ImageCard[] = [];
let picked: File[] = [];
let backend: Backend | null = null;
let handles: Handles | null = null;
let deviceReady = false;
let cloudConsent: boolean | null = null;

const msg = (t: string) => { $('msg').textContent = t; };

function updateCounter() {
  const n = cards.filter((c) => c.status === 'done' && c.source === 'device').length;
  $('counter').textContent = `${n} image${n === 1 ? '' : 's'} never left this computer`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  if (cls) e.className = cls as string;
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

function renderCard(c: ImageCard): HTMLElement {
  const root = el('article', { class: `card${c.approved ? ' approved' : ''}` });
  root.dataset.id = c.id;
  root.setAttribute('aria-label', `Card for ${c.file}`);
  if (c.thumbUrl) root.append(el('img', { src: c.thumbUrl, alt: `Preview of ${c.file}` }));
  root.append(el('div', { class: 'name' }, c.file));

  const status = el('div', { class: 'row' });
  if (c.status === 'working') status.append('Working…');
  if (c.source) {
    status.append(el('span', { class: `badge ${c.source}` }, c.source === 'device' ? 'Device' : 'Cloud'));
    if (c.kind && !c.decorative) status.append(el('span', { class: 'reason' }, `kind: ${c.kind}`));
  }
  if (c.status === 'skipped') status.append(el('span', { class: 'reason' }, 'Skipped: cloud use was not allowed.'));
  root.append(status);
  if (c.reason) root.append(el('div', { class: 'reason' }, `Reason: ${c.reason}`));
  if (c.deviceNote && c.source === 'cloud') root.append(el('div', { class: 'reason note' }, c.deviceNote));
  if (c.error) root.append(el('div', { class: 'err', role: 'alert' }, c.error));

  const altId = `alt-${c.id}`;
  const ta = el('textarea', { id: altId, value: c.decorative ? '' : c.alt, disabled: c.decorative });
  ta.addEventListener('input', () => { c.alt = ta.value; c.approved = false; root.classList.remove('approved'); });
  root.append(el('label', { htmlFor: altId }, 'Alt text'), ta);
  if (c.longDescription) {
    root.append(el('details', {}, el('summary', {}, 'Long description'), el('p', {}, c.longDescription)));
  }

  const dec = el('input', { type: 'checkbox', id: `dec-${c.id}`, checked: c.decorative });
  dec.addEventListener('change', () => { c.decorative = dec.checked; c.approved = false; rerender(c); });
  const appr = el('input', { type: 'checkbox', id: `ok-${c.id}`, checked: c.approved });
  appr.addEventListener('change', () => { c.approved = appr.checked; root.classList.toggle('approved', c.approved); });
  const send = el('button', { type: 'button', disabled: !c.blob || c.status === 'working' }, 'Send to cloud');
  send.addEventListener('click', async () => { c.forceCloud = true; await run([c]); });
  root.append(el('div', { class: 'row' },
    dec, el('label', { htmlFor: `dec-${c.id}` }, 'Decorative'),
    appr, el('label', { htmlFor: `ok-${c.id}` }, 'Approved'), send));
  return root;
}

function rerender(c: ImageCard) {
  const old = $('cards').querySelector(`[data-id="${c.id}"]`);
  const hadFocus = old?.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : '';
  const next = renderCard(c);
  if (old) old.replaceWith(next); else $('cards').append(next);
  if (hadFocus) document.getElementById(hadFocus)?.focus();
  updateCounter();
}

function renderAll() {
  $('cards').replaceChildren(...cards.map(renderCard));
  updateCounter();
}

async function confirmCloud(): Promise<boolean> {
  if (cloudConsent !== null) return cloudConsent;
  const dlg = $<HTMLDialogElement>('consent');
  cloudConsent = await new Promise<boolean>((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'yes'), { once: true });
    dlg.showModal();
  });
  return cloudConsent;
}

async function refreshDevice() {
  const a = await deviceAvailability();
  deviceReady = a === 'available';
  $('devstatus').textContent = a === null || a === 'unavailable'
    ? 'On-device model unavailable'
    : a === 'available' ? 'On-device model ready' : `On-device model: ${a}`;
}

async function run(list: ImageCard[]) {
  await refreshDevice();
  const ctx: DraftContext = { handles, tokenMargin: backend?.tokenMargin ?? DEFAULT_TOKEN_MARGIN, deviceReady, confirmCloud };
  for (const c of list) {
    c.status = 'working'; rerender(c);
    await draftCard(c, ctx);
    rerender(c);
  }
  msg('Done. Review each draft, then approve it.');
}

async function load() {
  const html = ($<HTMLTextAreaElement>('html')).value;
  cards = html.trim() ? await cardsFromHtml(html, picked) : await cardsFromFiles(picked);
  renderAll();
  msg(cards.length ? `${cards.length} image(s) loaded.` : 'No images found.');
}

function pick(e: Event) {
  picked = [...((e.target as HTMLInputElement).files ?? [])];
  const n = picked.filter((f) => f.type.startsWith('image/')).length;
  $('picked').textContent = `${picked.length} file(s) chosen, ${n} image(s).`;
}

async function refreshSessions() {
  if (!backend?.user) return;
  const sel = $<HTMLSelectElement>('sessions');
  const list = await listSessions(backend).catch(() => []);
  sel.replaceChildren(el('option', { value: '' }, 'Saved sessions'),
    ...list.map((s) => el('option', { value: s.id }, `${s.id.slice(0, 6)} (${s.count} images)`)));
}

async function init() {
  $('files').addEventListener('change', pick);
  $('folder').addEventListener('change', pick);
  $('load').addEventListener('click', () => void load());
  $('draft').addEventListener('click', () => void run(cards.filter((c) => c.blob && c.status !== 'working')));
  $('approve-all').addEventListener('click', () => {
    cards.forEach((c) => { if (c.status === 'done') c.approved = true; });
    renderAll();
  });
  $('exp-html').addEventListener('click', () => download('alt-filled.html', buildHtml(($<HTMLTextAreaElement>('html')).value, cards), 'text/html'));
  $('exp-csv').addEventListener('click', () => download('alt-text.csv', buildCsv(cards), 'text/csv'));
  $('save').addEventListener('click', async () => {
    if (!backend?.user) return msg('Saving needs Firebase and anonymous sign-in.');
    try { await saveSession(backend, cards); await refreshSessions(); msg('Session saved (text only).'); }
    catch (e) { msg(`Save failed: ${(e as Error).message}`); }
  });
  $('open').addEventListener('click', async () => {
    const id = $<HTMLSelectElement>('sessions').value;
    if (!backend || !id) return msg('Choose a saved session first.');
    const items = await loadSession(backend, id);
    cards = items.map((it, i) => ({
      id: `s${i}`, file: it.file, htmlIndex: -1, mime: '', kind: it.kind, alt: it.alt,
      decorative: it.kind === 'decorative', approved: false, status: 'done' as const,
      source: it.source || undefined, reason: it.reason || undefined,
    }));
    renderAll();
    msg(`Loaded ${items.length} saved item(s). Images are not stored, so they show text only.`);
  });
  $('init').addEventListener('click', async () => {
    if (!handles) return ($('devstatus').textContent = 'Firebase is not configured.');
    const prog = $<HTMLProgressElement>('prog');
    prog.hidden = false;
    try {
      await handles.hybrid.initializeDeviceModel((v) => { prog.value = Math.round(v * 100); $('devstatus').textContent = `Downloading… ${Math.round(v * 100)}%`; });
    } catch (e) {
      $('devstatus').textContent = `On-device model unavailable (${(e as Error).message})`;
    }
    prog.hidden = true;
    await refreshDevice();
  });

  await refreshDevice();
  if (!isFirebaseConfigured) {
    $('fbstatus').textContent = 'Firebase is not configured (copy .env.example to .env.local). Drafting needs it.';
    return;
  }
  backend = await startFirebase().catch((e: Error) => { $('fbstatus').textContent = `Firebase failed: ${e.message}`; return null; });
  if (backend) {
    handles = createHandles(backend.app);
    $('fbstatus').textContent = ['Firebase ready.', ...backend.notes].join(' ');
    await refreshSessions();
  }
}

void init();
