// Supabase Realtime channel shared by browsers (direct) and the server relay (/api/room).
export const ROOM_TOPIC = 'gc-room';

// Tab ids are random UUIDs; the relay only accepts this shape.
export const TAB_ID_PATTERN = /^[\w-]{8,64}$/;
