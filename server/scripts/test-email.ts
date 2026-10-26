import { randomUUID } from 'node:crypto'
import { emailConfig } from '../config/email.js'
import { sendEmail } from '../services/email.js'

async function main() {
  const recipients = [...new Set(process.argv.slice(2).map(value => value.trim()))]
  if (!recipients.length || recipients.length > 5 || recipients.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    console.error('Usage : npm run email:test -- adresse@gmail.com adresse@hotmail.com (maximum 5)')
    process.exitCode = 1
    return
  }
  if (emailConfig.provider !== 'brevo' && (emailConfig.provider !== 'smtp' || emailConfig.smtp.host !== 'smtp-relay.brevo.com')) {
    console.error('Test annulé : EMAIL_PROVIDER=brevo, ou SMTP Brevo, requis. Aucun message envoyé.')
    process.exitCode = 1
    return
  }
  if (!process.env.EMAIL_FROM?.trim() || (emailConfig.provider === 'brevo' ? !emailConfig.brevoApiKey : !emailConfig.smtp.user || !emailConfig.smtp.pass)) {
    console.error('Test annulé : EMAIL_FROM et les identifiants du fournisseur choisi doivent être renseignés. Aucun message envoyé.')
    process.exitCode = 1
    return
  }
  const reference = `EFPC-TEST-${randomUUID()}`
  console.log(`Test ${reference} — ${new Date().toISOString()}`)
  console.log('Envoi direct par la fonction de l’application ; aucune modification des données métier.')
  for (const to of recipients) {
    try {
      const result = await sendEmail({
        to,
        subject: `[TEST EFPC] Vérification e-mail — ${reference}`,
        text: `Ceci est un test technique d’envoi depuis l’application EFPC.\nRéférence : ${reference}\nAucune action ni réponse n’est nécessaire. Ce message ne concerne aucune demande d’achat.`,
      })
      if (!result.success || result.provider !== emailConfig.provider) throw new Error('Unexpected transport result')
      console.log(JSON.stringify({ to, status: result.provider === 'brevo' ? 'accepted_by_brevo_api' : 'accepted_by_smtp', messageId: result.messageId }))
    } catch (error) {
      const details = error as { code?: unknown; responseCode?: unknown }
      // Ne jamais afficher l’erreur brute : elle peut contenir des identifiants SMTP.
      const code = typeof details.code === 'string' && /^[A-Z_0-9]+$/.test(details.code) ? details.code : 'SEND_FAILED'
      console.error(JSON.stringify({ to, status: 'failed', code, responseCode: typeof details.responseCode === 'number' ? details.responseCode : undefined }))
      process.exitCode = 1
    }
  }
  console.log('Accepté par le fournisseur ne signifie pas livré : vérifier les journaux Brevo et les boîtes de réception/indésirables.')
}

main().catch(() => { console.error('Le test a échoué. Aucun détail secret affiché.'); process.exitCode = 1 })
