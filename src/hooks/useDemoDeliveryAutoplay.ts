import { useEffect } from 'react'
import { DEMO_AUTOPLAY_EVENT, type DemoAutoplayAction } from '../lib/demoAutoplay'
import { isDemoSession } from '../lib/demoSession'
import type { DeclarationOutcome } from '../lib/declarationValidation'
import { fullLinesFromPlanned } from '../lib/deliveryHelpers'
import type { DeliveryPoint, DeliveryProductOption } from '../types'

type UseDemoDeliveryAutoplayArgs = {
  delivery: DeliveryPoint | undefined
  deliveryId: string | undefined
  expectedPalettes: number
  deliveryProducts: DeliveryProductOption[]
  devOtpHint: string | null
  otp: string
  setOtp: (value: string) => void
  setStep: (step: 'start' | 'photos' | 'declare' | 'otp' | 'confirm') => void
  setDeclareOutcome: (outcome: DeclarationOutcome | null) => void
  setDeclareLines: (lines: ReturnType<typeof fullLinesFromPlanned>) => void
  handleStart: () => Promise<void>
  simulateTestPhoto: () => Promise<void>
  handleDeclare: () => Promise<void>
  handleSendOtp: () => Promise<void>
  handleConfirm: () => Promise<void>
}

export function useDemoDeliveryAutoplay({
  delivery,
  deliveryId,
  expectedPalettes,
  deliveryProducts,
  devOtpHint,
  otp,
  setOtp,
  setStep,
  setDeclareOutcome,
  setDeclareLines,
  handleStart,
  simulateTestPhoto,
  handleDeclare,
  handleSendOtp,
  handleConfirm,
}: UseDemoDeliveryAutoplayArgs): void {
  useEffect(() => {
    if (!isDemoSession() || deliveryId !== 'del-k1') return

    const onAction = (event: Event) => {
      const action = (event as CustomEvent<{ action: DemoAutoplayAction }>).detail?.action
      if (!action || !delivery) return

      void (async () => {
        try {
          switch (action) {
            case 'delivery:start':
              await handleStart()
              break
            case 'delivery:simulate-photo':
              await simulateTestPhoto()
              break
            case 'delivery:declare-full': {
              const lines = fullLinesFromPlanned(expectedPalettes, deliveryProducts)
              setDeclareOutcome('full')
              setDeclareLines(lines)
              setStep('declare')
              await new Promise((resolve) => setTimeout(resolve, 200))
              await handleDeclare()
              break
            }
            case 'delivery:send-otp':
              await handleSendOtp()
              break
            case 'delivery:confirm-otp': {
              const code = devOtpHint ?? otp ?? '123456'
              setOtp(code.padStart(6, '0').slice(0, 6))
              setStep('confirm')
              break
            }
            case 'delivery:confirm': {
              const code = (devOtpHint ?? otp ?? '123456').padStart(6, '0').slice(0, 6)
              setOtp(code)
              await handleConfirm()
              break
            }
            default:
              break
          }
        } catch {
          /* la visite continue même si une étape échoue */
        }
      })()
    }

    window.addEventListener(DEMO_AUTOPLAY_EVENT, onAction)
    return () => window.removeEventListener(DEMO_AUTOPLAY_EVENT, onAction)
  }, [
    delivery,
    deliveryId,
    deliveryProducts,
    devOtpHint,
    expectedPalettes,
    handleConfirm,
    handleDeclare,
    handleSendOtp,
    handleStart,
    otp,
    setDeclareLines,
    setDeclareOutcome,
    setOtp,
    setStep,
    simulateTestPhoto,
  ])
}
