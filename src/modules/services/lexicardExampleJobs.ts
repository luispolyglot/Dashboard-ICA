import { supabase } from '../../lib/supabase'

type KickWorkerParams = {
  batchSize?: number
}

export async function kickLexicardExampleWorker(
  params?: KickWorkerParams,
): Promise<void> {
  if (!supabase) return

  const batchSize = Math.max(1, Math.min(params?.batchSize || 2, 10))

  try {
    const { error } = await supabase.functions.invoke('lexicard-example-worker', {
      body: { batchSize },
    })

    if (error) {
      throw error
    }
  } catch (error) {
    console.error('Could not kick lexicard example worker', error)
  }
}
