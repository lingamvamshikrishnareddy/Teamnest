/** React Query key factory — shared so web & mobile invalidate consistently. */
export const qk = {
  session: ['session'] as const,
  kpis: {
    month: (userId: string, month: string) => ['kpis', 'month', userId, month] as const,
    team: (month: string) => ['kpis', 'team', month] as const,
  },
  leads: {
    list: (filters: object) => ['leads', 'list', filters] as const,
    detail: (id: string) => ['leads', 'detail', id] as const,
  },
  approvals: { inbox: ['approvals', 'inbox'] as const },
  attendance: { today: (userId: string) => ['attendance', 'today', userId] as const },
  notifications: { unread: (userId: string) => ['notifications', 'unread', userId] as const },
};
