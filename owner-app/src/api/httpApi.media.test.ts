import { afterEach, describe, expect, test, vi } from 'vitest'
import { createHttpApi } from './httpApi'

afterEach(() => vi.unstubAllGlobals())

describe('보호 영상 API', () => {
  test('점주 토큰으로 영상을 받아 재생용 Blob URL을 만든다', async () => {
    const createObjectURL = vi.fn(() => 'blob:keeper-video')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    const fetchMock = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })))
    vi.stubGlobal('fetch', fetchMock)

    const url = await createHttpApi('http://keeper.local', 'owner-token').getMediaUrl('clip/a')

    expect(url).toBe('blob:keeper-video')
    expect(fetchMock).toHaveBeenCalledWith('http://keeper.local/api/media/clip%2Fa', {
      method: 'GET',
      headers: { Authorization: 'Bearer owner-token' },
    })
    expect(createObjectURL).toHaveBeenCalledOnce()
  })
})
