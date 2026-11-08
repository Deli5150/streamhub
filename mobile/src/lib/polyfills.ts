import { randomUUID } from 'expo-crypto'

// Hermes has no crypto.randomUUID, which the shared combined-channels code uses for group ids.
const g = globalThis as { crypto?: { randomUUID?: () => string } }
g.crypto ??= {}
g.crypto.randomUUID ??= randomUUID
