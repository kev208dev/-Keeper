import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, test } from 'vitest'
import schema from '../../contract/keeper.schema.json'
import {
  buildScenario,
  cameraEvent,
  clipEvent,
  damageEvent,
  doorClosedEvent,
  doorOpenEvent,
  inquiryEvent,
  movementEvent,
} from './events'

const AT = '2026-10-23T05:08:00.000Z'

const ajv = new Ajv2020({ strict: false, allErrors: true })
ajv.addSchema(schema)
const validate = ajv.getSchema(`${schema.$id}#/$defs/IngestEvent`)!

function scenarioEvents() {
  return buildScenario().map((step) => step.build(AT))
}

function findEvent(type: string) {
  return scenarioEvents().filter((event) => event.type === type)
}

describe('시뮬레이터 이벤트', () => {
  test.each([
    ['카메라', cameraEvent('e', 'cam-01', 'connected', AT)],
    ['상품 이동', movementEvent('e', AT)],
    ['클립', clipEvent('e', 'm', AT)],
    ['문 개방', doorOpenEvent('e', AT)],
    ['문 닫힘', doorClosedEvent('e', 'd', AT)],
    ['상품 훼손', damageEvent('e', AT)],
    ['전달된 문의', inquiryEvent('e', 'forwarded', AT)],
    ['AI가 해결한 문의', inquiryEvent('e', 'ai_resolved', AT)],
  ])('%s 이벤트는 서버와의 계약을 통과한다', (_name, event) => {
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true)
  })

  test('시나리오의 모든 이벤트가 계약을 통과한다', () => {
    for (const event of scenarioEvents()) {
      expect(validate(event), JSON.stringify(validate.errors)).toBe(true)
    }
  })

  test('문이 열린 시각은 감지 시각보다 앞선다', () => {
    expect(doorOpenEvent('e', AT).openedAt).toBe('2026-10-23T04:58:00.000Z')
  })
})

describe('시나리오', () => {
  test('클립과 문 닫힘은 시나리오의 원본 알림을 가리킨다', () => {
    const steps = buildScenario()
    const events = steps.map((step) => step.build(AT))
    const movement = events.find((event) => event.type === 'alert.movement')!
    const door = events.find((event) => event.type === 'alert.door_open')!

    expect(events.find((event) => event.type === 'clip.ready')!.alertEventId).toBe(movement.eventId)
    expect(events.find((event) => event.type === 'door.closed')!.alertEventId).toBe(door.eventId)
  })

  test('원본 알림은 그것을 가리키는 이벤트보다 먼저 보낸다', () => {
    const types = scenarioEvents().map((event) => event.type)

    expect(types.indexOf('alert.movement')).toBeLessThan(types.indexOf('clip.ready'))
    expect(types.indexOf('alert.door_open')).toBeLessThan(types.indexOf('door.closed'))
  })

  test('재전송 단계는 같은 eventId를 다시 보낸다', () => {
    const [first, resent] = findEvent('alert.movement')

    expect(resent.eventId).toBe(first.eventId)
  })

  test('다시 실행하면 새 이벤트로 집계되도록 eventId가 달라진다', () => {
    expect(findEvent('alert.movement')[0].eventId).not.toBe(findEvent('alert.movement')[0].eventId)
  })
})
