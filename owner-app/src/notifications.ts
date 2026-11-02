const CHIME_HZ = 880
const CHIME_SECONDS = 0.18
const CHIME_VOLUME = 0.08

export async function requestPushPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  return (await Notification.requestPermission()) === 'granted'
}

export function showSystemNotification(message: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  new Notification('#Keeper', { body: message })
}

// 브라우저가 소리를 막아도 앱 동작에는 영향이 없다
export function playChime(): void {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = CHIME_HZ
    gain.gain.value = CHIME_VOLUME
    oscillator.connect(gain).connect(context.destination)
    oscillator.onended = () => void context.close()
    oscillator.start()
    oscillator.stop(context.currentTime + CHIME_SECONDS)
  } catch {
    // 소리를 낼 수 없는 환경
  }
}
