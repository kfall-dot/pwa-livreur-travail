import type { Response } from 'express'
import { z } from 'zod'

/**
 * Valide `body` contre un schéma zod à la frontière HTTP.
 * En cas d'échec, répond 400 avec un message lisible et renvoie `null`
 * (l'appelant doit alors `return`). Sinon renvoie les données typées.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  res: Response,
): z.infer<T> | null {
  const result = schema.safeParse(body)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const path = issue?.path.join('.')
  res.status(400).json({
    message: issue ? `${path ? `${path} : ` : ''}${issue.message}` : 'Requête invalide',
  })
  return null
}
