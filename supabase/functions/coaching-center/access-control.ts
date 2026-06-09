export function canManageSession(
  admin: { adminRole: 'coach_admin' | 'super_admin'; userId: string },
  coachUserId: string | null,
): boolean {
  if (admin.adminRole === 'super_admin') return true
  return Boolean(coachUserId) && coachUserId === admin.userId
}
