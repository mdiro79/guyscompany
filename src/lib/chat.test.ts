import { it, expect } from 'vitest';
import { layoutMessages, parseChatCommand, projectIdOf, seenBy, tokenize, isChatChannel } from './chat';
import { MESSAGE_DEFAULTS, type Message } from '@/lib/data/types';

const people = [{ id: 'n', username: 'nima', displayName: 'Nima' }, { id: 's', username: 'sara', displayName: 'Sara' }];
const today = '2026-11-12';

it('reads /task, /bug and /decision commands in both languages', () => {
  expect(parseChatCommand('/task Fix login @nima !! tomorrow', today, people)).toEqual({ cmd: 'task', title: 'Fix login', assigneeId: 'n', priority: 2, dueDate: '2026-11-13' });
  expect(parseChatCommand('/کار طراحی آیکن‌ها @Sara پس‌فردا', today, people)).toEqual({ cmd: 'task', title: 'طراحی آیکن‌ها', assigneeId: 's', priority: 0, dueDate: '2026-11-14' });
  expect(parseChatCommand('/bug Sign-in broken !!!', today, people)).toEqual({ cmd: 'bug', title: 'Sign-in broken', assigneeId: null, severity: 3 });
  expect(parseChatCommand('/bug small typo', today, people)).toMatchObject({ severity: 1 });
  expect(parseChatCommand('/decision Ship on Friday', today, people)).toEqual({ cmd: 'decision', text: 'Ship on Friday' });
  expect(parseChatCommand('/task @nima', today, people)).toBeNull();
  expect(parseChatCommand('/unknown x', today, people)).toBeNull();
  expect(parseChatCommand('hello /task x', today, people)).toBeNull();
  // An unknown @name stays in the title.
  expect(parseChatCommand('/t email @boss', today, people)).toMatchObject({ title: 'email @boss', assigneeId: null });
});

const msg = (id: string, authorId: string, at: string, o: Partial<Message> = {}): Message => ({
  ...MESSAGE_DEFAULTS, id, channel: 'team', authorId, body: id, fileId: null, createdAt: at, reactions: [], ...o,
});

it('groups messages by author, time and day', () => {
  const rows = layoutMessages([
    msg('a', 'x', '2026-11-11T10:00:00Z'), msg('b', 'x', '2026-11-11T10:02:00Z'), msg('c', 'y', '2026-11-11T10:03:00Z'),
    msg('d', 'y', '2026-11-11T10:20:00Z'), msg('e', 'y', '2026-11-12T10:21:00Z'), msg('f', 'y', '2026-11-12T10:22:00Z', { kind: 'task' }),
  ]);
  expect(rows.map((r) => [r.message.id, r.newDay, r.first, r.last])).toEqual([
    ['a', true, true, false], ['b', false, false, true], ['c', false, true, true], ['d', false, true, true], ['e', true, true, true], ['f', false, true, true],
  ]);
});

it('ticks, links and channels', () => {
  const m = msg('m', 'x', '2026-11-12T10:00:00Z');
  expect(seenBy(m, [{ userId: 'x', channel: 'team', readAt: '2026-11-12T11:00:00Z' }, { userId: 'y', channel: 'team', readAt: '2026-11-12T10:00:00Z' }, { userId: 'z', channel: 'team', readAt: '2026-11-12T09:00:00Z' }])).toEqual(['y']);
  expect(tokenize('see https://a.com/x, @sara!')).toEqual([{ kind: 'text', value: 'see ' }, { kind: 'link', value: 'https://a.com/x' }, { kind: 'text', value: ', ' }, { kind: 'mention', value: '@sara' }, { kind: 'text', value: '!' }]);
  expect(projectIdOf('project:10000000-0000-4000-8000-000000000001')).toBe('10000000-0000-4000-8000-000000000001');
  expect(isChatChannel('office:1')).toBe(false);
  expect(isChatChannel('team')).toBe(true);
});
