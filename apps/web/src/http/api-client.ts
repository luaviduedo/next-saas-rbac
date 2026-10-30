import ky from 'ky'
import cookiesNext from 'cookies-next'
import type { CookiesFn } from 'cookies-next'

export const api = ky.create({
  prefix: 'http://localhost:3333',
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        let cookieStore: CookiesFn | undefined

        if (typeof window === 'undefined') {
          const { cookies: serverCookies } = await import('next/headers')

          cookieStore = serverCookies
        }

        const token = await cookiesNext.getCookie('token', {
          cookies: cookieStore,
        })

        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
  },
})
