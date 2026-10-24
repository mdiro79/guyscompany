import { Home, FolderKanban, CheckSquare, Users, CalendarDays, FileText, Settings, Shield, Box, Lightbulb, PenLine } from 'lucide-react';

export const NAV = [
  { href: '/', key: 'home', icon: Home },
  { href: '/projects', key: 'projects', icon: FolderKanban },
  { href: '/tasks', key: 'tasks', icon: CheckSquare },
  { href: '/ideas', key: 'ideas', icon: Lightbulb },
  { href: '/team', key: 'team', icon: Users },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/files', key: 'files', icon: FileText },
  { href: '/office', key: 'office', icon: Box },
  { href: '/board', key: 'board', icon: PenLine },
  { href: '/settings', key: 'settings', icon: Settings },
] as const;

export const ADMIN_NAV = { href: '/admin', key: 'admin', icon: Shield } as const;

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
