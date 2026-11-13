import { Home, FolderKanban, CheckSquare, MessageCircle, Users, CalendarDays, FileText, Settings, Shield, Box, Lightbulb, PenLine, NotebookPen, Activity, BarChart3, Gamepad2 } from 'lucide-react';

export const NAV = [
  { href: '/', key: 'home', icon: Home },
  { href: '/chat', key: 'chat', icon: MessageCircle },
  { href: '/projects', key: 'projects', icon: FolderKanban },
  { href: '/tasks', key: 'tasks', icon: CheckSquare },
  { href: '/ideas', key: 'ideas', icon: Lightbulb },
  { href: '/pulse', key: 'pulse', icon: Activity },
  { href: '/team', key: 'team', icon: Users },
  { href: '/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/files', key: 'files', icon: FileText },
  { href: '/office', key: 'office', icon: Box },
  { href: '/arcade', key: 'arcade', icon: Gamepad2 },
  { href: '/board', key: 'board', icon: PenLine },
  { href: '/meetings', key: 'meetings', icon: NotebookPen },
  { href: '/insights', key: 'insights', icon: BarChart3 },
  { href: '/settings', key: 'settings', icon: Settings },
] as const;

export const ADMIN_NAV = { href: '/admin', key: 'admin', icon: Shield } as const;

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
