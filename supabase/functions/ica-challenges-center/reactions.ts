import { jsonResponse } from '../_shared/http.ts'
import type { AdminClient } from './types.ts'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function listChallengeReactions(input: {
  adminClient: AdminClient
  userId: string
  body: Record<string, unknown>
}): Promise<Response> {
  const challengeId = text(input.body.challengeId)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.', code: 'REACTION_REQUEST_INVALID' })

  const { data: challenge, error: challengeError } = await input.adminClient
    .from('ica_challenges')
    .select('id, status, challenger_user_id, challenged_user_id')
    .eq('id', challengeId)
    .maybeSingle()
  if (challengeError) return jsonResponse(500, { error: challengeError.message })
  if (!challenge || (challenge.challenger_user_id !== input.userId && challenge.challenged_user_id !== input.userId)) {
    return jsonResponse(404, { error: 'Desafío no encontrado.', code: 'ICA_CHALLENGE_NOT_FOUND' })
  }
  if (challenge.status !== 'completed') {
    return jsonResponse(400, { error: 'Las reacciones aparecen cuando termina el desafío.', code: 'REACTION_CHALLENGE_NOT_COMPLETED' })
  }

  const { data, error } = await input.adminClient
    .from('ica_challenge_reactions')
    .select('id, challenge_id, sender_user_id, kind, value, created_at')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) return jsonResponse(500, { error: error.message })
  return jsonResponse(200, { ok: true, rows: data || [] })
}

export async function sendChallengeReaction(input: {
  adminClient: AdminClient
  userId: string
  body: Record<string, unknown>
}): Promise<Response> {
  const challengeId = text(input.body.challengeId)
  const kind = text(input.body.kind)
  const value = text(input.body.value)
  if (!challengeId) return jsonResponse(400, { error: 'challengeId inválido.', code: 'REACTION_REQUEST_INVALID' })

  const { data, error } = await input.adminClient.rpc('send_ica_challenge_reaction', {
    p_sender_user_id: input.userId,
    p_challenge_id: challengeId,
    p_kind: kind,
    p_value: value,
  })
  if (error) {
    const message = error.message || 'No se pudo enviar la reacción.'
    const knownCode = [
      'ICA_CHALLENGE_NOT_FOUND', 'REACTION_CHALLENGE_NOT_COMPLETED', 'REACTION_NOT_PARTICIPANT',
      'REACTION_KIND_INVALID', 'REACTION_VALUE_INVALID', 'REACTION_STREAK_LIMIT',
    ].find((code) => message.includes(code))
    return jsonResponse(400, { error: message, ...(knownCode ? { code: knownCode } : {}) })
  }
  return jsonResponse(200, { ok: true, row: data })
}
