// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, getAccessToken, setAccessToken } from './client'

function streamResponse(events, status = 200) {
  const body = events
    .map(
      ({ event, data }) =>
        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join('')

  return new Response(
    new ReadableStream({
      start(controller) {
        const encoded = new TextEncoder().encode(body)
        controller.enqueue(encoded.slice(0, 9))
        controller.enqueue(encoded.slice(9))
        controller.close()
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    },
  )
}

afterEach(() => {
  setAccessToken(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('api.streamPost', () => {
  it('sends authenticated JSON and reports chunks before completion', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse([
        { event: 'chunk', data: { text: 'Hola ' } },
        { event: 'chunk', data: { text: 'mundo.' } },
        {
          event: 'complete',
          data: {
            success: true,
            message: 'ok',
            data: { reply: { content: 'Hola mundo.' } },
          },
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    setAccessToken('access-token')
    const chunks = []

    const result = await api.streamPost(
      '/admin/assistant/messages/stream',
      { message: 'Hola' },
      { onTextChunk: (chunk) => chunks.push(chunk) },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/assistant/messages/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({ message: 'Hola' }),
        credentials: 'include',
      }),
    )
    expect(chunks).toEqual(['Hola ', 'mundo.'])
    expect(result).toEqual({ reply: { content: 'Hola mundo.' } })
  })

  it('surfaces server errors and rejects incomplete streams', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          streamResponse([
            {
              event: 'error',
              data: {
                success: false,
                error: {
                  code: 'ASSISTANT_TIMEOUT',
                  message: 'Timed out',
                },
              },
            },
          ]),
        )
        .mockResolvedValueOnce(
          streamResponse([
            { event: 'chunk', data: { text: 'Partial' } },
          ]),
        ),
    )

    await expect(
      api.streamPost(
        '/admin/assistant/messages/stream',
        { message: 'Hola' },
        { onTextChunk: () => {} },
      ),
    ).rejects.toMatchObject({ code: 'ASSISTANT_TIMEOUT' })

    await expect(
      api.streamPost(
        '/admin/assistant/messages/stream',
        { message: 'Hola' },
        { onTextChunk: () => {} },
      ),
    ).rejects.toMatchObject({
      code: 'ASSISTANT_STREAM_INTERRUPTED',
    })
  })

  it('refreshes an expired access token before opening the stream', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'AUTHENTICATION_REQUIRED', message: 'Expired' },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              accessToken: 'refreshed-token',
              user: { id: 1, role: 'EDITOR' },
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        streamResponse([
          {
            event: 'complete',
            data: { success: true, data: { reply: { content: 'OK' } } },
          },
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)
    setAccessToken('expired-token')

    const result = await api.streamPost(
      '/admin/assistant/messages/stream',
      { message: 'Hola' },
      { onTextChunk: () => {} },
    )

    expect(result.reply.content).toBe('OK')
    expect(getAccessToken()).toBe('refreshed-token')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(
      'Bearer refreshed-token',
    )
  })
})
