// StreamHub's go-live alerts are local notifications scheduled on the phone, never push. The
// expo-notifications plugin still asks for the push entitlement (aps-environment), which a free
// Apple ID's personal team can't sign, so it's removed. Listed first in app.config.ts (see there).
const { withEntitlementsPlist } = require('expo/config-plugins')

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment']
    return c
  })
}
