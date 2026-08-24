import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  advanceDemoAutoplay,
  demoPathMatches,
  DEMO_AUTOPLAY_STEPS,
  dispatchDemoAutoplayAction,
  getDemoAutoplaySnapshot,
  getDemoAutoplayState,
  getDemoAutoplayStep,
  skipDemoAutoplayStep,
  stopDemoAutoplay,
  subscribeDemoAutoplay,
  type DemoAutoplayStep,
} from '../lib/demoAutoplay'

export function DemoAutoplayBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const advancingRef = useRef(false)
  const revision = useSyncExternalStore(
    subscribeDemoAutoplay,
    getDemoAutoplaySnapshot,
    () => 0,
  )
  const state = getDemoAutoplayState()
  const step = state ? getDemoAutoplayStep(state) : null
  const steps = state ? DEMO_AUTOPLAY_STEPS[state.role] : []
  const total = steps.length
  const autoplayIndex = state?.index ?? -1
  const autoplayRole = state?.role

  useEffect(() => {
    const current = getDemoAutoplayState()
    const currentStep = current ? getDemoAutoplayStep(current) : null
    if (!current || !currentStep) return
    if (demoPathMatches(location.pathname, location.search, currentStep.path)) return
    navigate(currentStep.path)
  }, [revision, autoplayIndex, autoplayRole, location.pathname, location.search, navigate])

  useEffect(() => {
    const current = getDemoAutoplayState()
    const currentStep = current ? getDemoAutoplayStep(current) : null
    if (!current || !currentStep) return
    if (!demoPathMatches(location.pathname, location.search, currentStep.path)) return

    const timer = window.setTimeout(() => {
      if (advancingRef.current) return
      advancingRef.current = true
      void (async () => {
        try {
          if (currentStep.action) {
            dispatchDemoAutoplayAction(currentStep.action)
            if (currentStep.waitMs) {
              await new Promise((resolve) => setTimeout(resolve, currentStep.waitMs))
            }
          }
          const next = advanceDemoAutoplay()
          if (next) {
            const currentPath = window.location.pathname
            const currentSearch = window.location.search
            if (!demoPathMatches(currentPath, currentSearch, next.path)) {
              navigate(next.path)
            }
          }
        } finally {
          advancingRef.current = false
        }
      })()
    }, currentStep.durationMs)

    return () => window.clearTimeout(timer)
  }, [
    revision,
    autoplayIndex,
    autoplayRole,
    step?.path,
    step?.durationMs,
    step?.action,
    step?.waitMs,
    location.pathname,
    location.search,
    navigate,
  ])

  const handleSkip = useCallback(() => {
    const next = skipDemoAutoplayStep()
    if (next) {
      const nextStep = getDemoAutoplayStep(next)
      if (nextStep && !demoPathMatches(location.pathname, location.search, nextStep.path)) {
        navigate(nextStep.path)
      }
    }
  }, [location.pathname, location.search, navigate])

  const handleStop = useCallback(() => {
    stopDemoAutoplay()
  }, [])

  if (!state || !step) return null
  if (!demoPathMatches(location.pathname, location.search, step.path)) return null

  return (
    <AutoplayChrome
      step={step}
      index={state.index}
      total={total}
      onSkip={handleSkip}
      onStop={handleStop}
    />
  )
}

function AutoplayChrome({
  step,
  index,
  total,
  onSkip,
  onStop,
}: {
  step: DemoAutoplayStep
  index: number
  total: number
  onSkip: () => void
  onStop: () => void
}) {
  return (
    <div className="demo-autoplay" data-demo-autoplay role="status" aria-live="polite">
      <div className="demo-autoplay__copy">
        <p className="demo-autoplay__eyebrow">
          Visite guidée · {index + 1}/{total}
        </p>
        <p className="demo-autoplay__caption">{step.caption}</p>
      </div>
      <div className="demo-autoplay__actions">
        <button type="button" className="demo-autoplay__btn" onClick={onSkip}>
          Suivant
        </button>
        <button type="button" className="demo-autoplay__btn demo-autoplay__btn--ghost" onClick={onStop}>
          Arrêter
        </button>
      </div>
    </div>
  )
}
