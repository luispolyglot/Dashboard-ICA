import { supabase } from '@/lib/supabase'
import type { PushSubscriptionDevice } from '../types'

const PUSH_SW_PATH = '/push-sw.js'

type PushSubscriptionRow = {
  id: string
  endpoint: string
  is_active: boolean
  user_agent: string | null
  created_at: string
  updated_at: string
  last_seen_at: string
}

export class PushNotificationsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushNotificationsError'
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

function getVapidPublicKey(): string {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key || typeof key !== 'string') {
    throw new PushNotificationsError(
      'Falta VITE_VAPID_PUBLIC_KEY para habilitar notificaciones push.',
    )
  }
  return key
}

function assertBrowserSupport(): void {
  if (typeof window === 'undefined') {
    throw new PushNotificationsError('Push notifications solo estan disponibles en navegador.')
  }

  if (!('serviceWorker' in navigator)) {
    throw new PushNotificationsError('Este navegador no soporta Service Worker.')
  }

  if (!('PushManager' in window)) {
    throw new PushNotificationsError('Este navegador no soporta Push API.')
  }

  if (!('Notification' in window)) {
    throw new PushNotificationsError('Este navegador no soporta Notification API.')
  }
}

function mapDevice(row: PushSubscriptionRow): PushSubscriptionDevice {
  return {
    id: row.id,
    endpoint: row.endpoint,
    isActive: row.is_active,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  }
}

async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  if (!supabase) {
    throw new PushNotificationsError('Supabase no esta configurado.')
  }

  const payload = subscription.toJSON()
  const endpoint = payload.endpoint || ''
  const p256dh = payload.keys?.p256dh || ''
  const auth = payload.keys?.auth || ''

  if (!endpoint || !p256dh || !auth) {
    throw new PushNotificationsError('La suscripcion push no es valida.')
  }

  const { error } = await supabase.from('user_push_subscriptions').upsert(
    {
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    throw new PushNotificationsError('No se pudo guardar la suscripcion push.')
  }
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  try {
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
    if (registration) return registration
    return await navigator.serviceWorker.register(PUSH_SW_PATH)
  } catch {
    return null
  }
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function enablePushOnCurrentDevice(): Promise<NotificationPermission> {
  assertBrowserSupport()
  getVapidPublicKey()

  const registration = await registerPushServiceWorker()
  if (!registration) {
    throw new PushNotificationsError('No se pudo registrar el Service Worker.')
  }

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    throw new PushNotificationsError('Debes permitir notificaciones para activarlas.')
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(
      getVapidPublicKey(),
    ) as unknown as BufferSource

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })
  }

  await savePushSubscription(subscription)
  return permission
}

export async function disablePushOnCurrentDevice(): Promise<void> {
  assertBrowserSupport()
  if (!supabase) {
    throw new PushNotificationsError('Supabase no esta configurado.')
  }

  const registration = await registerPushServiceWorker()
  if (!registration) return

  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  const { error } = await supabase
    .from('user_push_subscriptions')
    .update({ is_active: false, last_seen_at: new Date().toISOString() })
    .eq('endpoint', endpoint)

  if (error) {
    throw new PushNotificationsError('No se pudo desactivar la suscripcion push.')
  }
}

export async function listMyPushDevices(): Promise<PushSubscriptionDevice[]> {
  if (!supabase) {
    throw new PushNotificationsError('Supabase no esta configurado.')
  }

  const { data, error } = await supabase
    .from('user_push_subscriptions')
    .select('id, endpoint, is_active, user_agent, created_at, updated_at, last_seen_at')
    .order('updated_at', { ascending: false })

  if (error) {
    throw new PushNotificationsError('No se pudieron cargar los dispositivos push.')
  }

  return (data || []).map((row) => mapDevice(row as PushSubscriptionRow))
}

export async function getCurrentPushSubscriptionEndpoint(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator)) return null

  const registration = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH)
  if (!registration) return null

  const subscription = await registration.pushManager.getSubscription()
  return subscription?.endpoint || null
}
