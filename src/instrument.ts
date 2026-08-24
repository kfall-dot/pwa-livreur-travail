import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { reactRouterV7BrowserTracingIntegration } from '@sentry/react'
import { shouldDropSentryError } from '../shared/sentryFilters'

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

function clientSentryEnvironment(): string {
  const fromBuild = import.meta.env.VITE_SENTRY_ENV?.trim()
  if (fromBuild) return fromBuild
  return import.meta.env.PROD ? 'production' : 'development'
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: clientSentryEnvironment(),
    integrations: [
      reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        matchRoutes,
        createRoutesFromChildren,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 1.0,
    tracePropagationTargets: ['localhost', /^\/api/, /^https:\/\/.*\.netlify\.app/],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.1 : 0,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      if (shouldDropSentryError(hint.originalException)) return null
      return event
    },
  })
}
