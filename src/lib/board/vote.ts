'use client';
import { useSyncExternalStore } from 'react';
import type { Mesh, PeerInfo } from '@/lib/realtime/mesh';
import { syncedNow } from '@/lib/realtime/room';

// A quick show of hands in the conference room: someone asks a question, everyone answers yes, no or
// "not sure", and the count shows on the big screen as it comes in. Live over the WebRTC mesh only
// (nothing is stored): each member tells the others their own answer; a newer question replaces the old one.

export type Choice = 'yes' | 'no' | 'unsure';
export const CHOICES: Choice[] = ['yes', 'no', 'unsure'];
export interface QuickVote { id: string; question: string; by: string; t: number; open: boolean; votes: Record<string, Choice> }

let vote: QuickVote | null = null;
let me: string | null = null;
let mesh: Mesh | null = null;
const listeners = new Set<() => void>();
const changed = () => { if (vote) vote = { ...vote, votes: { ...vote.votes } }; listeners.forEach((l) => l()); };
const isChoice = (c: unknown): c is Choice => CHOICES.includes(c as Choice);

export const tally = (v: QuickVote) => ({ yes: 0, no: 0, unsure: 0, ...Object.values(v.votes).reduce<Record<string, number>>((n, c) => { n[c] = (n[c] ?? 0) + 1; return n; }, {}) }) as Record<Choice, number>;

const header = () => (vote ? { type: 'qvote', op: 'state', id: vote.id, question: vote.question, by: vote.by, t: vote.t, open: vote.open, choice: me ? vote.votes[me] ?? null : null } : null);

export const quickVote = {
  get: () => vote,
  start(question: string) {
    if (!me) return;
    vote = { id: crypto.randomUUID(), question: question.trim().slice(0, 120), by: me, t: syncedNow(), open: true, votes: {} };
    mesh?.sendEvent(header()!);
    changed();
  },
  cast(choice: Choice) {
    if (!me || !vote?.open) return;
    vote.votes[me] = choice;
    mesh?.sendEvent({ type: 'qvote', op: 'cast', id: vote.id, choice });
    changed();
  },
  end() {
    if (!vote?.open) return;
    vote.open = false;
    mesh?.sendEvent({ type: 'qvote', op: 'end', id: vote.id });
    changed();
  },
  /** Takes the result off the screen. */
  clear() {
    if (!vote) return;
    mesh?.sendEvent({ type: 'qvote', op: 'clear', id: vote.id });
    vote = null;
    changed();
  },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

function onMessage(from: PeerInfo, msg: Record<string, unknown>) {
  if (msg.type !== 'qvote' || typeof msg.id !== 'string') return;
  if (msg.op === 'state' && typeof msg.question === 'string' && typeof msg.by === 'string' && typeof msg.t === 'number') {
    // A newer question wins; the same one only adds the sender's answer.
    if (!vote || (vote.id !== msg.id && msg.t > vote.t)) vote = { id: msg.id, question: msg.question.slice(0, 120), by: msg.by, t: msg.t, open: msg.open !== false, votes: {} };
    if (vote.id !== msg.id) return;
    if (msg.open === false) vote.open = false;
    if (isChoice(msg.choice)) vote.votes[from.userId] = msg.choice;
  } else if (!vote || vote.id !== msg.id) return;
  else if (msg.op === 'cast' && isChoice(msg.choice) && vote.open) vote.votes[from.userId] = msg.choice;
  else if (msg.op === 'end') vote.open = false;
  else if (msg.op === 'clear') vote = null;
  else if (msg.op !== 'state') return;
  changed();
}

export function connectQuickVote(m: Mesh | null, userId: string) {
  me = userId; mesh = m;
  if (!m) return () => {};
  const off = m.onEvent(onMessage);
  // Late joiners get the question and my answer.
  const offPeers = m.onPeers(() => setTimeout(() => { const h = header(); if (h) m.sendEvent(h); }, 1300));
  return () => { off(); offPeers(); mesh = null; };
}

export const subscribeQuickVote = quickVote.subscribe;
export const useQuickVote = () => useSyncExternalStore(quickVote.subscribe, quickVote.get, quickVote.get);
