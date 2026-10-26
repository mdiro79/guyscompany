import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './memory-store';

describe('memory store', () => {
  it('claims an empty office and moves the owner with their private chat', async () => {
    const store = createMemoryStore();
    const [one, , , four] = await store.listOffices();
    const owner = one.ownerId!;
    await store.updateOffice(4, { ownerId: null });
    await store.createMessage({ channel: 'office:1', authorId: owner, body: 'mine', fileId: null });
    await store.createMessage({ channel: 'office:4', authorId: four.ownerId, body: 'old secret', fileId: null });
    expect(await store.claimOffice(4, owner)).toBe('claimed');
    const offices = await store.listOffices();
    expect(offices[0]).toMatchObject({ ownerId: null, glass: 'clear', locked: false, isPublic: false });
    expect(offices[3]).toMatchObject({ ownerId: owner, isPublic: one.isPublic });
    expect((await store.listMessages('office:4', 10)).map((m) => m.body)).toEqual(['mine']);
    expect(await store.claimOffice(4, offices[1].ownerId!)).toBe('taken');
  });
});
