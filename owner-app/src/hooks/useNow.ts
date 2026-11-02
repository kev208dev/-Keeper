import { useEffect, useState } from 'react'

// start 시각에서 출발해 실제 시간만큼 흘러가는 현재 시각
export function useNow(start: Date, intervalMs = 30_000): Date {
  const [now, setNow] = useState(start)

  useEffect(() => {
    const origin = Date.now()
    const timer = setInterval(() => {
      setNow(new Date(start.getTime() + Date.now() - origin))
    }, intervalMs)
    return () => clearInterval(timer)
  }, [start, intervalMs])

  return now
}
