import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type AdminClient = ReturnType<typeof createClient<any>>
export type ChallengeScope = 'global' | 'language'
export type ChallengeStatus =
  | 'created'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'not_accepted'
export type LanguagePair = { targetLang: string; nativeLang: string }
