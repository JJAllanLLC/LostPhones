(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoveryContent = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REVIEW = {
    lastReviewed: '2026-09-19',
    owner: 'JJ ALLAN LLC',
    reviewTrigger: 'Quarterly or when the provider changes its recovery service'
  };

  const OFFICIAL_URLS = {
    appleFind: 'https://www.icloud.com/find',
    appleLostSupport: 'https://support.apple.com/101593',
    appleAccountRecovery: 'https://iforgot.apple.com/',
    googleFind: 'https://android.com/find',
    googleLostSupport: 'https://support.google.com/android/answer/6160491',
    googleAccountRecovery: 'https://accounts.google.com/signin/recovery'
  };

  const APPROVED_ACTION_IDS = Object.freeze([
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-mark-lost',
    'google-locate-secure',
    'apple-reversible-locate',
    'google-reversible-locate',
    'identify-platform',
    'personal-safety',
    'apple-auth-fallback',
    'google-auth-fallback'
  ]);

  const AUTH_RELEVANT_ACTION_IDS = Object.freeze([
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-mark-lost',
    'google-locate-secure',
    'apple-reversible-locate',
    'google-reversible-locate',
    'personal-safety',
    'apple-auth-fallback',
    'google-auth-fallback'
  ]);

  function record(fields) {
    return Object.freeze({
      lastReviewed: REVIEW.lastReviewed,
      owner: REVIEW.owner,
      reviewTrigger: REVIEW.reviewTrigger,
      ...fields
    });
  }

  const actions = Object.freeze([
    record({
      actionId: 'apple-play-sound',
      platform: 'iphone',
      applicableSituations: ['nearby'],
      title: 'Play a sound on the missing iPhone',
      reason: 'If the iPhone is close by, a sound is the fastest way to find it without leaving this place.',
      instruction: 'Open Apple Find Devices and sign in with the Apple Account used on the missing iPhone. Select that iPhone and choose Play Sound. Listen nearby. Do not travel to a map pin or approach anyone.',
      caution: 'Never confront a suspected thief. If the sound does not help, stay where you are and use Find Devices only from a safe place.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'You are leaving LostPhones for Apple Find Devices.',
      authRelevant: true
    }),
    record({
      actionId: 'google-play-sound',
      platform: 'android',
      applicableSituations: ['nearby'],
      title: 'Play a sound on the missing Android phone',
      reason: 'If the phone is close by, a sound is the fastest way to find it without leaving this place.',
      instruction: 'Open Google Find Hub and sign in with the Google Account used on the missing phone. Select that phone and play a sound. Listen nearby. Do not travel to a map pin or approach anyone.',
      caution: 'Never confront a suspected thief. If the sound does not help, stay where you are and use Find Hub only from a safe place.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'You are leaving LostPhones for Google Find Hub.',
      authRelevant: true
    }),
    record({
      actionId: 'apple-locate-mark-lost',
      platform: 'iphone',
      applicableSituations: ['lost'],
      title: 'Locate or mark the iPhone as lost',
      reason: 'Apple Find Devices can show a location and help lock the iPhone so other people cannot use it.',
      instruction: 'Open Apple Find Devices and sign in with the Apple Account used on the missing iPhone. Select that iPhone. Check its location if shown, then mark it as lost. Do not go to the displayed location or confront anyone.',
      caution: 'A location on a map is not a reason to travel or confront anyone. Stay safe and use the official controls from where you are.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'You are leaving LostPhones for Apple Find Devices.',
      authRelevant: true
    }),
    record({
      actionId: 'google-locate-secure',
      platform: 'android',
      applicableSituations: ['lost'],
      title: 'Locate and secure the Android phone',
      reason: 'Google Find Hub can show a location and help you secure the missing phone from another device.',
      instruction: 'Open Google Find Hub and sign in with the Google Account used on the missing phone. Select that phone. Check its location if shown, then use the official secure or lock options. Do not go to the displayed location or confront anyone.',
      caution: 'A location on a map is not a reason to travel or confront anyone. Stay safe and use the official controls from where you are.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'You are leaving LostPhones for Google Find Hub.',
      authRelevant: true
    }),
    record({
      actionId: 'apple-reversible-locate',
      platform: 'iphone',
      applicableSituations: ['unsure'],
      title: 'Check the iPhone location without confronting anyone',
      reason: 'If you are not sure what happened, a location check can help you decide the next step without taking irreversible action yet.',
      instruction: 'Open Apple Find Devices and sign in with the Apple Account used on the iPhone. Select that iPhone and review its location if one is shown. Do not travel there and do not confront anyone. You can mark it lost later if that becomes the right step.',
      caution: 'This is a reversible check. Do not confront anyone, and do not treat a map pin as a place you must go.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'You are leaving LostPhones for Apple Find Devices.',
      authRelevant: true
    }),
    record({
      actionId: 'google-reversible-locate',
      platform: 'android',
      applicableSituations: ['unsure'],
      title: 'Check the Android location without confronting anyone',
      reason: 'If you are not sure what happened, a location check can help you decide the next step without taking irreversible action yet.',
      instruction: 'Open Google Find Hub and sign in with the Google Account used on the phone. Select that phone and review its location if one is shown. Do not travel there and do not confront anyone. You can secure it later if that becomes the right step.',
      caution: 'This is a reversible check. Do not confront anyone, and do not treat a map pin as a place you must go.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'You are leaving LostPhones for Google Find Hub.',
      authRelevant: true
    }),
    record({
      actionId: 'identify-platform',
      platform: 'unsure',
      applicableSituations: ['nearby', 'lost', 'unsure'],
      title: 'Identify whether the missing phone is an iPhone or Android',
      reason: 'The official recovery service depends on the missing phone, not on the browser you are using now.',
      instruction: 'Look for clues about the missing phone itself: its case, charging cable, previous screenshots, a box, a receipt, or how the owner used it. Apple devices use Apple Find Devices. Android devices use Google Find Hub. Start over after you know which one it is. LostPhones will not guess from this browser.',
      caution: 'Do not assume the missing phone matches this computer or borrowed phone.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: null,
      authRelevant: false
    }),
    record({
      actionId: 'personal-safety',
      platform: 'iphone',
      applicableSituations: ['stolen'],
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the iPhone may have been stolen, personal safety comes before Find Devices, location checks, or travel.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. Once you are safe, Apple Find Devices will be the next official service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: 'After you are safe, you can leave LostPhones for Apple Find Devices.',
      authRelevant: true,
      nextServiceName: 'Apple Find Devices'
    }),
    record({
      actionId: 'personal-safety',
      platform: 'android',
      applicableSituations: ['stolen'],
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the phone may have been stolen, personal safety comes before Find Hub, location checks, or travel.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. Once you are safe, Google Find Hub will be the next official service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: 'After you are safe, you can leave LostPhones for Google Find Hub.',
      authRelevant: true,
      nextServiceName: 'Google Find Hub'
    }),
    record({
      actionId: 'personal-safety',
      platform: 'unsure',
      applicableSituations: ['stolen'],
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the phone may have been stolen, personal safety comes first. LostPhones will not guess which company’s recovery service to use yet.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. After you are safe, identify whether the missing phone is an iPhone or Android before using an official recovery service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: null,
      authRelevant: false,
      nextServiceName: null
    }),
    record({
      actionId: 'apple-auth-fallback',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      title: 'Recover the Apple Account without sharing a password here',
      reason: 'LostPhones never asks for Apple Account passwords or verification codes. Apple’s official recovery pages are the safe next step.',
      instruction: 'Use Apple Account Recovery to regain access through Apple. On Apple Find Devices, you may be able to choose Find Devices without entering a verification code sent to the missing iPhone. Never type an Apple password or verification code into LostPhones.',
      caution: 'Only use Apple’s official recovery pages. Do not give passwords or codes to anyone who contacts you.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleAccountRecovery,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Account Recovery',
      leavingLabel: 'You are leaving LostPhones for Apple Account Recovery.',
      secondaryOfficialUrl: OFFICIAL_URLS.appleFind,
      secondaryOfficialLabel: 'Open Apple Find Devices',
      secondaryLeavingLabel: 'You are leaving LostPhones for Apple Find Devices.',
      authRelevant: false
    }),
    record({
      actionId: 'google-auth-fallback',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      title: 'Recover the Google Account without sharing a password here',
      reason: 'LostPhones never asks for Google passwords or verification codes. Google’s official recovery page is the safe next step.',
      instruction: 'Use Google Account Recovery. Google may offer a recovery email, backup verification, or other official account-recovery methods. Never type a Google password or verification code into LostPhones.',
      caution: 'Only use Google’s official recovery pages. Do not give passwords or codes to anyone who contacts you.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleAccountRecovery,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Account Recovery',
      leavingLabel: 'You are leaving LostPhones for Google Account Recovery.',
      authRelevant: false
    })
  ]);

  const privacyGuidance = Object.freeze({
    trusted: Object.freeze({
      id: 'trusted',
      title: 'You are on a trusted device',
      items: Object.freeze([
        'Use the official Apple or Google service as you normally would.',
        'LostPhones does not save this recovery session.'
      ])
    }),
    borrowed: Object.freeze({
      id: 'borrowed',
      title: 'Using a device from someone you trust',
      items: Object.freeze([
        'Use the phone owner’s account only.',
        'Do not save credentials.',
        'Sign out of the official service when finished.',
        'LostPhones keeps the current flow in memory only.'
      ])
    }),
    public: Object.freeze({
      id: 'public',
      title: 'Using a public or shared device',
      items: Object.freeze([
        'Do not save passwords.',
        'Use a private browsing window if available.',
        'Sign out of every official service.',
        'Close the browser when finished.',
        'LostPhones stores no recovery answers persistently.'
      ])
    })
  });

  function getAction(actionId, platform) {
    return actions.find((item) => item.actionId === actionId && item.platform === platform) || null;
  }

  function getApprovedOfficialUrls() {
    return Object.freeze(Object.values(OFFICIAL_URLS));
  }

  return {
    REVIEW,
    OFFICIAL_URLS,
    APPROVED_ACTION_IDS,
    AUTH_RELEVANT_ACTION_IDS,
    actions,
    privacyGuidance,
    getAction,
    getApprovedOfficialUrls
  };
});
