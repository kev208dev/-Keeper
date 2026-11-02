import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom에는 요소 스크롤이 구현되어 있지 않다
Element.prototype.scrollTo = () => {}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})
