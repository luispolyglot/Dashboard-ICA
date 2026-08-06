export function canManageSession(
  admin: { adminRole: 'coach_admin' | 'super_admin'; userId: string },
  coachUserId: string | null,
  supportCoachUserId: string | null,
): boolean {
  if (admin.adminRole === 'super_admin') return true
  if (Boolean(coachUserId) && coachUserId === admin.userId) return true
  return Boolean(supportCoachUserId) && supportCoachUserId === admin.userId
}
