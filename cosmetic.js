// Cosmetic filters: hide cookie walls, consent banners and anti-adblock overlays.
// Injected into every page after load. Layout-safe: display:none only.
module.exports = `
#onetrust-banner-sdk, #onetrust-consent-sdk,
#CybotCookiebotDialog, #CybotCookiebotDialogBodyUnderlay,
#cookie-banner, .cookie-banner, #cookieBanner, .cookie-notice, #cookie-notice,
.cookie-consent, #cookie-consent, .cookie-popup, #cookie-popup,
.cc-window, .cc-banner, #cookiescript_injected,
.qc-cmp2-container, #qc-cmp2-container,
.fc-consent-root, .fc-dialog-overlay,
#sp_message_container, [id^="sp_message_container"],
.sp-message-open, .message-overlay,
#didomi-host, .didomi-popup-open .didomi-popup-backdrop,
.osano-cm-window, .osano-cm-dialog,
.truste_overlay, .truste_box_overlay,
#gdpr-banner, .gdpr-banner, .gdpr-popup,
.adblock-modal, .adblock-overlay, .adblock-wall, .adb-modal,
#adblock-message, .adblock-message, .anti-adblock,
[class*="adblock-detect"], [id*="adblock-detect"]
{ display: none !important; }
`;
