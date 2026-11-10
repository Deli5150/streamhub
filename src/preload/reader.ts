import { contextBridge } from 'electron'

// Preload of the hidden windows that read follows and live status (main/hidden.ts). Those pages are
// never seen, so they must never ask for a passkey: on Windows that opens a Windows Hello prompt
// out of nowhere, again on every read. Sign-in prompts belong in the visible sign-in window.
contextBridge.executeInMainWorld({
  func: () => {
    const refuse = (): Promise<never> => Promise.reject(new DOMException('Not available in StreamHub’s background reader', 'NotAllowedError'))
    if (navigator.credentials) {
      navigator.credentials.get = refuse
      navigator.credentials.create = refuse
    }
    const pkc = (window as { PublicKeyCredential?: { isConditionalMediationAvailable?: () => Promise<boolean> } }).PublicKeyCredential
    if (pkc) pkc.isConditionalMediationAvailable = () => Promise.resolve(false)
  }
})
