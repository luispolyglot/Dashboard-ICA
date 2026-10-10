import { enablePushOnCurrentDevice } from './pushNotifications'
import { fetchPushReminderPreferences, upsertPushReminderPreferences } from './pushReminderPreferences'

/**
 * «Activar en este dispositivo» in the profile guide (Luis, 7 Oct): push on this device plus all
 * the reminders on (ICA streak, flashcards streak, habit loss and streak at risk). The browser
 * permission prompt needs a tap, so this only runs from a button.
 */
export async function turnOnRemindersOnThisDevice(): Promise<void> {
  // Push first: if the person refuses the browser prompt, no preference is changed.
  await enablePushOnCurrentDevice()
  const current = await fetchPushReminderPreferences()
  await upsertPushReminderPreferences({
    icaStreakEnabled: true,
    icaStreakHour: current.icaStreakHour,
    flashcardsStreakEnabled: true,
    flashcardsStreakHour: current.flashcardsStreakHour,
    habitLossEnabled: true,
    streakRiskEnabled: true,
  })
}
