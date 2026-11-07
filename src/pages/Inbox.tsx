import { Navigate } from 'react-router-dom'

/**
 * R-INBOX-02: the Inbox is now the first module of the WhatsApp CRM (one screen with the platform switcher
 * All · WhatsApp · Facebook · Instagram). Old links to /inbox land there.
 */
export function Inbox() {
  return <Navigate to="/whatsapp-crm?tab=inbox" replace />
}
