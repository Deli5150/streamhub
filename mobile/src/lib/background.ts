import * as BackgroundTask from 'expo-background-task'
import * as Notifications from 'expo-notifications'
import { AndroidImportance } from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import { Platform as OS } from 'react-native'
import { loadStore } from '../desktop/store'
import { backgroundCheck } from './hub'

// Go-live alerts while StreamHub isn't open. Phones decide when background work runs: Android
// every 15 minutes or so, iOS when it judges best (often less often). While the app is open, live
// status is checked every 1–2 minutes as on the desktop.

const TASK = 'streamhub-live-check'

TaskManager.defineTask(TASK, async () => {
  try {
    await loadStore()
    await backgroundCheck()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch (e) {
    console.error('[background]', e)
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
})

/** Asks for notification permission and schedules the background live check. */
export async function setupLiveAlerts(): Promise<void> {
  if (OS.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Go-live alerts', importance: AndroidImportance.HIGH })
  }
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') await Notifications.requestPermissionsAsync()
  if ((await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available) {
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 })
  }
}
