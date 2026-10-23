// Storage object path for a user's upload: <userId>/<uuid>-<safe name>.
export const safeFileName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
export const uploadPath = (userId: string, name: string) => `${userId}/${crypto.randomUUID()}-${safeFileName(name)}`;
export const ownsPath = (userId: string, path: string) => path.startsWith(`${userId}/`) && !path.includes('..') && path.split('/').length === 2;
