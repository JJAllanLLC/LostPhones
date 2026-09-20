(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesRecoveryContent = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REVIEW = Object.freeze({
    lastReviewed: '2026-09-19',
    owner: 'JJ ALLAN LLC',
    reviewTrigger: 'Official Apple or Google recovery URL, account-protection URL, or documented procedure change'
  });

  const OFFICIAL_URLS = Object.freeze({
    appleFind: 'https://www.icloud.com/find',
    appleLostSupport: 'https://support.apple.com/101593',
    appleAccountRecovery: 'https://iforgot.apple.com/',
    appleAccount: 'https://account.apple.com',
    appleAccountSecurity: 'https://support.apple.com/102541',
    googleFind: 'https://android.com/find',
    googleLostSupport: 'https://support.google.com/android/answer/6160491',
    googleAccountRecovery: 'https://accounts.google.com/signin/recovery',
    googleAccountSecurity: 'https://myaccount.google.com/security',
    googleAccountRecoveryHelp: 'https://support.google.com/accounts/answer/46526'
  });

  const APPROVED_ACTION_IDS = Object.freeze([
    'personal-safety',
    'identify-platform',
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-device',
    'google-locate-device',
    'apple-mark-lost',
    'google-mark-lost',
    'apple-auth-fallback',
    'google-auth-fallback',
    'protect-primary-account',
    'protect-mobile-line',
    'protect-financial-accounts',
    'report-and-document',
    'erase-device-decision',
    'recovered-device-security-check',
    'recovery-replacement-transition'
  ]);

  const AUTH_RELEVANT_ACTION_IDS = Object.freeze([
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-device',
    'google-locate-device',
    'apple-mark-lost',
    'google-mark-lost',
    'protect-primary-account'
  ]);

  const EXTERNAL_ACTION_IDS = Object.freeze([
    'apple-play-sound',
    'google-play-sound',
    'apple-locate-device',
    'google-locate-device',
    'apple-mark-lost',
    'google-mark-lost',
    'apple-auth-fallback',
    'google-auth-fallback',
    'protect-primary-account',
    'protect-mobile-line',
    'protect-financial-accounts'
  ]);

  const SIGN_IN_BLOCKED = Object.freeze([
    { id: 'cannot_sign_in', label: 'I cannot sign in' },
    { id: 'cannot_receive_verification', label: 'I cannot receive the verification code' },
    { id: 'service_unavailable', label: 'The official service was unavailable' }
  ]);

  const LOCATE_OUTCOMES = Object.freeze([
    { id: 'nearby', label: 'The phone appears nearby or I can hear it' },
    { id: 'located_safe', label: 'It is shown at a place I can reach safely' },
    { id: 'located_unsafe', label: 'It is shown somewhere I should not go' },
    { id: 'offline', label: 'The phone is offline or not reporting a location' },
    { id: 'not_found', label: 'No useful location was shown' },
    { id: 'unknown', label: 'I could not tell from the official service' }
  ].concat(SIGN_IN_BLOCKED));

  const SOUND_OUTCOMES = Object.freeze([
    { id: 'heard_nearby', label: 'I heard the phone nearby' },
    { id: 'not_heard', label: 'I did not hear it' }
  ].concat(SIGN_IN_BLOCKED));

  const SECURE_OUTCOMES = Object.freeze([
    { id: 'marked', label: 'I marked it lost or locked it' },
    { id: 'could_not_mark', label: 'I could not mark it lost or lock it' }
  ].concat(SIGN_IN_BLOCKED));

  const AUTH_OUTCOMES = Object.freeze([
    { id: 'recovered_access', label: 'I recovered access to the account' },
    { id: 'still_blocked', label: 'I still cannot sign in' },
    { id: 'waiting_for_provider', label: 'I am waiting on Apple or Google' },
    { id: 'service_unavailable', label: 'The official service was unavailable' }
  ]);

  const PROTECT_ACCOUNT_OUTCOMES = Object.freeze([
    { id: 'secured', label: 'I reviewed and secured the primary account' },
    { id: 'already_secure', label: 'The account already looks secure' },
    { id: 'cannot_sign_in', label: 'I cannot sign in to the primary account' },
    { id: 'cannot_receive_verification', label: 'I cannot receive the verification code' },
    { id: 'needs_owner', label: 'Only the owner can complete this' }
  ]);

  const PROTECT_LINE_OUTCOMES = Object.freeze([
    { id: 'secured', label: 'I contacted the carrier through its official app or site' },
    { id: 'cannot_access_carrier', label: 'I cannot reach the carrier yet' },
    { id: 'waiting_for_provider', label: 'I am waiting for the carrier' },
    { id: 'needs_owner', label: 'Only the owner can complete this' }
  ]);

  const PROTECT_FINANCIAL_OUTCOMES = Object.freeze([
    { id: 'secured', label: 'I reviewed banks and cards through official apps or sites' },
    { id: 'no_exposure', label: 'No payment apps or cards appear exposed' },
    { id: 'waiting_for_provider', label: 'I am waiting for a bank or card issuer' },
    { id: 'needs_owner', label: 'Only the owner can complete this' }
  ]);

  const REPORT_OUTCOMES = Object.freeze([
    { id: 'documented', label: 'I documented what I can without storing details here' },
    { id: 'skipped_for_now', label: 'I will do this later' }
  ]);

  const ERASE_OUTCOMES = Object.freeze([
    { id: 'confirmed_erase', label: 'I understand and want the official erase option' },
    { id: 'not_now', label: 'Do not erase yet' }
  ]);

  const RECOVERED_CHECK_OUTCOMES = Object.freeze([
    { id: 'in_hand_safe', label: 'I have the phone and it is safe to use here' },
    { id: 'unsafe_to_retrieve', label: 'It is not safe to retrieve or use yet' }
  ]);

  const REPLACEMENT_OUTCOMES = Object.freeze([
    { id: 'acknowledged', label: 'I will handle replacement later' }
  ]);

  const QUESTIONS = Object.freeze([
    Object.freeze({
      id: 'situation',
      title: 'What happened?',
      help: 'Choose the closest description. You can refine this after the official service shows more.',
      choices: Object.freeze([
        Object.freeze({ id: 'nearby', label: 'It may be nearby' }),
        Object.freeze({ id: 'lost', label: 'It is lost' }),
        Object.freeze({ id: 'stolen', label: 'It may have been stolen' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'platform',
      title: 'What kind of phone is missing?',
      help: 'Use the missing phone, not the device you are using now.',
      choices: Object.freeze([
        Object.freeze({ id: 'iphone', label: 'iPhone' }),
        Object.freeze({ id: 'android', label: 'Android' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'currentDevice',
      title: 'What device are you using now?',
      help: 'LostPhones never assumes you can reach the missing phone from here.',
      choices: Object.freeze([
        Object.freeze({ id: 'trusted', label: 'My trusted computer or another phone of mine' }),
        Object.freeze({ id: 'borrowed', label: 'A device from someone I trust' }),
        Object.freeze({ id: 'public', label: 'A public or shared device' })
      ])
    }),
    Object.freeze({
      id: 'safety',
      title: 'Are you in a safe place right now?',
      help: 'If you may be in immediate danger, contact local emergency services. Do not confront anyone or travel to a displayed location.',
      choices: Object.freeze([
        Object.freeze({ id: 'safe', label: 'Yes, I am somewhere safe' }),
        Object.freeze({ id: 'unsafe', label: 'Not yet — I still need to get to safety' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'recovered',
      title: 'Do you have the phone in your possession?',
      help: 'Only say yes if you physically have it and can keep it. Do not retrieve it from an unsafe place.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes, I have it' }),
        Object.freeze({ id: 'no', label: 'No, it is still missing' })
      ])
    }),
    Object.freeze({
      id: 'unlockRisk',
      title: 'Could someone else have unlocked or used it?',
      help: 'Think about whether it was out of the owner’s control, even briefly.',
      choices: Object.freeze([
        Object.freeze({ id: 'probably_not', label: 'Probably not' }),
        Object.freeze({ id: 'possible', label: 'It is possible' }),
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'suspiciousActivity',
      title: 'Have you seen any suspicious activity?',
      help: 'Examples include unexpected sign-in alerts, password-reset emails, or charges you do not recognize. Do not enter those details here.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'accountAccess',
      title: 'Can you sign in to the official Apple or Google account used on the missing phone?',
      help: 'Never type that password or a verification code into LostPhones.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'verificationAccess',
      title: 'Can you receive the verification code without the missing phone?',
      help: 'Use another trusted device, a recovery email, or a printed code if you have one. Do not enter any code here.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'financialExposure',
      title: 'Could wallets, payment apps, or saved cards on the phone be used?',
      help: 'Check official bank or card apps and statements later. Do not enter card numbers here.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes, that is possible' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'carrierAccess',
      title: 'Can you reach the mobile carrier through its official app or website?',
      help: 'Use the carrier printed on a bill, SIM pack, or the official app. LostPhones does not keep a carrier directory.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'Not right now' }),
        Object.freeze({ id: 'unsure', label: 'I am not sure' })
      ])
    }),
    Object.freeze({
      id: 'eraseAcknowledge',
      title: 'Erase is irreversible on the missing phone',
      help: 'Erasing can stop later location updates. Use it only when the phone is still missing, reversible steps are done, recovery looks unlikely, and there is real compromise risk.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'I understand those consequences' }),
        Object.freeze({ id: 'no', label: 'Do not show erase yet' })
      ])
    }),
    Object.freeze({
      id: 'eraseConfirm',
      title: 'Confirm that you want the official erase option',
      help: 'This does not erase anything inside LostPhones. The official Apple or Google service will ask you again.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes, open the official erase option' }),
        Object.freeze({ id: 'no', label: 'Not now' })
      ])
    })
  ]);

  function record(action) {
    return Object.freeze(Object.assign({
      lastReviewed: REVIEW.lastReviewed,
      owner: REVIEW.owner,
      reviewTrigger: REVIEW.reviewTrigger,
      boundedOutcomes: Object.freeze([]),
      planLane: 'now',
      requiresExternalReturn: false,
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      sourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: null,
      returnPrompt: null,
      nextServiceName: null
    }, action, {
      sourceUrl: action.sourceUrl || action.supportSourceUrl || action.officialUrl || null,
      boundedOutcomes: Object.freeze(action.boundedOutcomes || [])
    }));
  }

  function locateInstruction(provider, findName) {
    return 'Open ' + findName + ' in a new tab and sign in with the ' + provider + ' account used on the missing phone. Select that phone and review any location or last-seen information. Keep LostPhones open and come back here afterward. Do not travel to a displayed location and do not confront anyone.';
  }

  const actions = Object.freeze([
    record({
      actionId: 'personal-safety',
      platform: 'iphone',
      applicableSituations: ['stolen', 'unsure'],
      applicableConditions: 'Asked first when theft is possible, or when a location looks unsafe. Never skipped for stolen phones until the person is safe.',
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the iPhone may have been stolen, personal safety comes before Find Devices, location checks, or travel.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. Once you are safe, Apple Find Devices can be the next official service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: 'After you are safe, you can leave LostPhones for Apple Find Devices.',
      planLane: 'now',
      nextServiceName: 'Apple Find Devices',
      boundedOutcomes: Object.freeze([
        { id: 'safe', label: 'I am somewhere safe now' },
        { id: 'still_unsafe', label: 'I still need to get to safety' }
      ])
    }),
    record({
      actionId: 'personal-safety',
      platform: 'android',
      applicableSituations: ['stolen', 'unsure'],
      applicableConditions: 'Asked first when theft is possible, or when a location looks unsafe. Never skipped for stolen phones until the person is safe.',
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the phone may have been stolen, personal safety comes before Find Hub, location checks, or travel.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. Once you are safe, Google Find Hub can be the next official service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: 'After you are safe, you can leave LostPhones for Google Find Hub.',
      planLane: 'now',
      nextServiceName: 'Google Find Hub',
      boundedOutcomes: Object.freeze([
        { id: 'safe', label: 'I am somewhere safe now' },
        { id: 'still_unsafe', label: 'I still need to get to safety' }
      ])
    }),
    record({
      actionId: 'personal-safety',
      platform: 'unsure',
      applicableSituations: ['stolen', 'unsure'],
      applicableConditions: 'Asked first when theft is possible and the missing phone type is still unknown.',
      title: 'Move to safety before using any phone-recovery service',
      reason: 'If the phone may have been stolen, personal safety comes first. LostPhones will not guess which company’s recovery service to use yet.',
      instruction: 'Get to a place where you feel safe. If you may be in immediate danger, contact local emergency services. Do not confront a suspected thief and do not travel to a displayed location. After you are safe, identify whether the missing phone is an iPhone or Android before using an official recovery service.',
      caution: 'Never confront a suspected thief. Do not go looking for the phone.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: 'I’m somewhere safe',
      leavingLabel: null,
      planLane: 'now',
      nextServiceName: null,
      boundedOutcomes: Object.freeze([
        { id: 'safe', label: 'I am somewhere safe now' },
        { id: 'still_unsafe', label: 'I still need to get to safety' }
      ])
    }),
    record({
      actionId: 'identify-platform',
      platform: 'unsure',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Shown when the missing phone type is unknown. LostPhones does not infer platform from this browser.',
      title: 'Identify whether the missing phone is an iPhone or Android',
      reason: 'The official recovery service depends on the missing phone, not on the browser you are using now.',
      instruction: 'Look for clues about the missing phone itself: its case, charging cable, previous screenshots, a box, a receipt, or how the owner used it. Apple devices use Apple Find Devices. Android devices use Google Find Hub. LostPhones will not guess from this browser.',
      caution: 'Do not assume the missing phone matches this computer or borrowed phone.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: null,
      planLane: 'now',
      boundedOutcomes: Object.freeze([
        { id: 'iphone', label: 'It is an iPhone' },
        { id: 'android', label: 'It is an Android phone' },
        { id: 'still_unsure', label: 'I still cannot tell' }
      ])
    }),
    record({
      actionId: 'apple-play-sound',
      platform: 'iphone',
      applicableSituations: ['nearby'],
      applicableConditions: 'First locate step when the iPhone may be nearby. Uses Apple Find Devices only.',
      title: 'Play a sound on the iPhone through Apple Find Devices',
      reason: 'A sound can help you find an iPhone that is in the same area without assuming you can unlock it from here.',
      instruction: 'Open Apple Find Devices in a new tab and sign in with the Apple Account used on the iPhone. Select that iPhone and play a sound. Keep LostPhones available and return here after you try. If you cannot hear it, LostPhones will help you locate and secure it next.',
      caution: 'This computer cannot ring the missing iPhone by itself. Use Apple’s official Find Devices page.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'Apple Find Devices opens in a new tab. Keep this LostPhones page available and return after you try.',
      returnPrompt: 'When you are back from Apple Find Devices, tell LostPhones what happened. LostPhones does not assume success from opening the tab.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: SOUND_OUTCOMES
    }),
    record({
      actionId: 'google-play-sound',
      platform: 'android',
      applicableSituations: ['nearby'],
      applicableConditions: 'First locate step when the Android phone may be nearby. Uses Google Find Hub only.',
      title: 'Play a sound on the Android phone through Google Find Hub',
      reason: 'A sound can help you find an Android phone that is in the same area without assuming you can unlock it from here.',
      instruction: 'Open Google Find Hub in a new tab and sign in with the Google Account used on the phone. Select that phone and play a sound. Keep LostPhones available and return here after you try. If you cannot hear it, LostPhones will help you locate and secure it next.',
      caution: 'This computer cannot ring the missing phone by itself. Use Google’s official Find Hub page.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'Google Find Hub opens in a new tab. Keep this LostPhones page available and return after you try.',
      returnPrompt: 'When you are back from Google Find Hub, tell LostPhones what happened. LostPhones does not assume success from opening the tab.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: SOUND_OUTCOMES
    }),
    record({
      actionId: 'apple-locate-device',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Used after safety and platform are known, whenever the iPhone is still missing and a location check can change the next step.',
      title: 'Check the iPhone location in Apple Find Devices',
      reason: 'Apple Find Devices can show whether the iPhone is nearby, at a known place, offline, or not found. That result changes the next step.',
      instruction: locateInstruction('Apple', 'Apple Find Devices'),
      caution: 'A map pin is not a place you must go. Never confront anyone.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'Apple Find Devices opens in a new tab. Keep this LostPhones page available and return after you check.',
      returnPrompt: 'When you are back from Apple Find Devices, choose the closest result. LostPhones does not infer a location from the tab opening.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: LOCATE_OUTCOMES
    }),
    record({
      actionId: 'google-locate-device',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Used after safety and platform are known, whenever the Android phone is still missing and a location check can change the next step.',
      title: 'Check the Android location in Google Find Hub',
      reason: 'Google Find Hub can show whether the phone is nearby, at a known place, offline, or not found. That result changes the next step.',
      instruction: locateInstruction('Google', 'Google Find Hub'),
      caution: 'A map pin is not a place you must go. Never confront anyone.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'Google Find Hub opens in a new tab. Keep this LostPhones page available and return after you check.',
      returnPrompt: 'When you are back from Google Find Hub, choose the closest result. LostPhones does not infer a location from the tab opening.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: LOCATE_OUTCOMES
    }),
    record({
      actionId: 'apple-mark-lost',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'After a location check, or when the iPhone remains missing. Mark Lost can still apply when the device is offline.',
      title: 'Mark the iPhone as Lost in Apple Find Devices',
      reason: 'Lost Mode can lock the iPhone, display a message, and reduce the chance that someone else uses it. This is separate from checking its location.',
      instruction: 'Return to Apple Find Devices in a new tab. Select the missing iPhone and mark it as Lost if that control is available. Keep LostPhones open and come back after you try. Do not enter a phone number or message text into LostPhones.',
      caution: 'Marking Lost is a security step. It is not the same as erasing the iPhone.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'Apple Find Devices opens in a new tab. Keep this LostPhones page available and return after you mark it lost.',
      returnPrompt: 'When you are back, tell LostPhones whether Lost Mode was turned on. Opening the tab does not count as completed.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: SECURE_OUTCOMES
    }),
    record({
      actionId: 'google-mark-lost',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'After a location check, or when the Android phone remains missing. Secure Device can still apply when the device is offline.',
      title: 'Secure the Android phone in Google Find Hub',
      reason: 'Secure Device can lock the phone and show a message. This is separate from checking its location.',
      instruction: 'Return to Google Find Hub in a new tab. Select the missing phone and use Secure Device if that control is available. Keep LostPhones open and come back after you try. Do not enter a phone number or message text into LostPhones.',
      caution: 'Securing the phone is a security step. It is not the same as erasing it.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'Google Find Hub opens in a new tab. Keep this LostPhones page available and return after you secure it.',
      returnPrompt: 'When you are back, tell LostPhones whether the phone was secured. Opening the tab does not count as completed.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: SECURE_OUTCOMES
    }),
    record({
      actionId: 'apple-auth-fallback',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Used when Apple Account sign-in or verification is blocked. Never collect passwords or codes in LostPhones.',
      title: 'Recover the Apple Account without sharing a password here',
      reason: 'LostPhones never asks for Apple Account passwords or verification codes. Apple’s official recovery pages are the safe next step.',
      instruction: 'Use Apple Account Recovery in a new tab to regain access through Apple. Keep LostPhones available and return afterward. On Apple Find Devices, you may be able to choose Find Devices without entering a verification code sent to the missing iPhone. Never type an Apple password or verification code into LostPhones.',
      caution: 'Only use Apple’s official recovery pages. Do not give passwords or codes to anyone who contacts you.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleAccountRecovery,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Account Recovery',
      leavingLabel: 'Apple Account Recovery opens in a new tab. Keep this LostPhones page available and return after you try.',
      returnPrompt: 'When you are back from Apple, tell LostPhones whether you recovered access. LostPhones does not assume success from the tab.',
      secondaryOfficialUrl: OFFICIAL_URLS.appleFind,
      secondaryOfficialLabel: 'Open Apple Find Devices',
      secondaryLeavingLabel: 'Apple Find Devices opens in a new tab. Keep LostPhones available and return afterward.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: AUTH_OUTCOMES
    }),
    record({
      actionId: 'google-auth-fallback',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Used when Google Account sign-in or verification is blocked. Never collect passwords or codes in LostPhones.',
      title: 'Recover the Google Account without sharing a password here',
      reason: 'LostPhones never asks for Google passwords or verification codes. Google’s official recovery page is the safe next step.',
      instruction: 'Use Google Account Recovery in a new tab. Keep LostPhones available and return afterward. Google may offer a recovery email, backup verification, or other official account-recovery methods. Never type a Google password or verification code into LostPhones.',
      caution: 'Only use Google’s official recovery pages. Do not give passwords or codes to anyone who contacts you.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleAccountRecovery,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Account Recovery',
      leavingLabel: 'Google Account Recovery opens in a new tab. Keep this LostPhones page available and return after you try.',
      returnPrompt: 'When you are back from Google, tell LostPhones whether you recovered access. LostPhones does not assume success from the tab.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: AUTH_OUTCOMES
    }),
    record({
      actionId: 'protect-primary-account',
      platform: 'iphone',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'When theft, unknown loss, suspicious activity, or unlock risk exists. Uses Apple’s official account pages only.',
      title: 'Protect the Apple Account used on the missing iPhone',
      reason: 'If someone else may have the iPhone, the Apple Account is a high-value target. Review it only on Apple’s official site.',
      instruction: 'Open Apple’s official account page in a new tab. Review sign-in, trusted devices, and security settings there. Keep LostPhones available and return afterward. Never type an Apple password or verification code into LostPhones.',
      caution: 'Use only Apple’s official account pages. Do not enter account details here.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleAccount,
      supportSourceUrl: OFFICIAL_URLS.appleAccountSecurity,
      primaryControlLabel: 'Open Apple Account',
      leavingLabel: 'Apple Account opens in a new tab. Keep this LostPhones page available and return after you review it.',
      returnPrompt: 'When you are back from Apple Account, choose the closest result. LostPhones does not assume the account is secure from the tab opening.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_ACCOUNT_OUTCOMES
    }),
    record({
      actionId: 'protect-primary-account',
      platform: 'android',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'When theft, unknown loss, suspicious activity, or unlock risk exists. Uses Google’s official account pages only.',
      title: 'Protect the Google Account used on the missing phone',
      reason: 'If someone else may have the phone, the Google Account is a high-value target. Review it only on Google’s official site.',
      instruction: 'Open Google Account security in a new tab. Review sign-in, devices, and security settings there. Keep LostPhones available and return afterward. Never type a Google password or verification code into LostPhones.',
      caution: 'Use only Google’s official account pages. Do not enter account details here.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleAccountSecurity,
      supportSourceUrl: OFFICIAL_URLS.googleAccountRecoveryHelp,
      primaryControlLabel: 'Open Google Account security',
      leavingLabel: 'Google Account security opens in a new tab. Keep this LostPhones page available and return after you review it.',
      returnPrompt: 'When you are back from Google Account, choose the closest result. LostPhones does not assume the account is secure from the tab opening.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_ACCOUNT_OUTCOMES
    }),
    record({
      actionId: 'protect-mobile-line',
      platform: 'iphone',
      applicableSituations: ['stolen', 'unsure', 'lost'],
      applicableConditions: 'When theft, verification risk, or line risk exists. Users must use the carrier’s official app, website, or bill — never an unofficial directory.',
      title: 'Protect the mobile line through the official carrier',
      reason: 'A stolen or missing iPhone can be used to intercept calls, texts, or account-recovery codes on that number.',
      instruction: 'Use the carrier’s official app, website, or the contact details on a recent bill or SIM pack. Ask the carrier to protect the line. Keep LostPhones available and return afterward. LostPhones does not keep a list of carriers and does not need the phone number.',
      caution: 'Do not give the number or account PIN to LostPhones or to anyone who contacts you unexpectedly.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: 'Use the carrier’s official app or website in another tab, then return to LostPhones.',
      returnPrompt: 'When you are back from the carrier, tell LostPhones whether the line was protected. LostPhones never stores the phone number.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_LINE_OUTCOMES
    }),
    record({
      actionId: 'protect-mobile-line',
      platform: 'android',
      applicableSituations: ['stolen', 'unsure', 'lost'],
      applicableConditions: 'When theft, verification risk, or line risk exists. Users must use the carrier’s official app, website, or bill — never an unofficial directory.',
      title: 'Protect the mobile line through the official carrier',
      reason: 'A stolen or missing Android phone can be used to intercept calls, texts, or account-recovery codes on that number.',
      instruction: 'Use the carrier’s official app, website, or the contact details on a recent bill or SIM pack. Ask the carrier to protect the line. Keep LostPhones available and return afterward. LostPhones does not keep a list of carriers and does not need the phone number.',
      caution: 'Do not give the number or account PIN to LostPhones or to anyone who contacts you unexpectedly.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: 'Use the carrier’s official app or website in another tab, then return to LostPhones.',
      returnPrompt: 'When you are back from the carrier, tell LostPhones whether the line was protected. LostPhones never stores the phone number.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_LINE_OUTCOMES
    }),
    record({
      actionId: 'protect-financial-accounts',
      platform: 'iphone',
      applicableSituations: ['stolen', 'unsure', 'lost'],
      applicableConditions: 'When wallets, payment apps, saved cards, or suspicious activity may be involved. Use official bank or card apps only.',
      title: 'Protect banks and cards through official apps or sites',
      reason: 'If the iPhone had wallets, payment apps, or saved cards, review those accounts on the bank or card issuer’s official app or website.',
      instruction: 'Open each bank or card issuer’s official app or website, or use the number on the back of the card or on a statement. Review recent activity there. Keep LostPhones available and return afterward. Do not enter card numbers, balances, or transaction details into LostPhones.',
      caution: 'LostPhones is not a bank and does not keep a financial directory.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: 'Use official bank or card sites in another tab, then return to LostPhones.',
      returnPrompt: 'When you are back, choose the closest result. Do not enter financial details here.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_FINANCIAL_OUTCOMES
    }),
    record({
      actionId: 'protect-financial-accounts',
      platform: 'android',
      applicableSituations: ['stolen', 'unsure', 'lost'],
      applicableConditions: 'When wallets, payment apps, saved cards, or suspicious activity may be involved. Use official bank or card apps only.',
      title: 'Protect banks and cards through official apps or sites',
      reason: 'If the phone had wallets, payment apps, or saved cards, review those accounts on the bank or card issuer’s official app or website.',
      instruction: 'Open each bank or card issuer’s official app or website, or use the number on the back of the card or on a statement. Review recent activity there. Keep LostPhones available and return afterward. Do not enter card numbers, balances, or transaction details into LostPhones.',
      caution: 'LostPhones is not a bank and does not keep a financial directory.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: null,
      primaryControlLabel: null,
      leavingLabel: 'Use official bank or card sites in another tab, then return to LostPhones.',
      returnPrompt: 'When you are back, choose the closest result. Do not enter financial details here.',
      requiresExternalReturn: true,
      planLane: 'next',
      boundedOutcomes: PROTECT_FINANCIAL_OUTCOMES
    }),
    record({
      actionId: 'report-and-document',
      platform: 'iphone',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'Later work after immediate containment. Does not block stabilization. No report numbers or free-form incident text are stored.',
      title: 'Document what you need for later reports or claims',
      reason: 'A police report or carrier claim can wait until you are safe and the high-risk accounts are handled. LostPhones does not store report numbers.',
      instruction: 'Write down what you need in your own notes, not in LostPhones: the official steps you already took, and any report you may file later. Use official local reporting channels if you choose to report a theft. Do not paste IMEI, serial, locations, or a story into this page.',
      caution: 'Reporting is optional for stabilization. Do not delay safety or account protection for paperwork.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: null,
      leavingLabel: null,
      planLane: 'later',
      boundedOutcomes: REPORT_OUTCOMES
    }),
    record({
      actionId: 'report-and-document',
      platform: 'android',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'Later work after immediate containment. Does not block stabilization. No report numbers or free-form incident text are stored.',
      title: 'Document what you need for later reports or claims',
      reason: 'A police report or carrier claim can wait until you are safe and the high-risk accounts are handled. LostPhones does not store report numbers.',
      instruction: 'Write down what you need in your own notes, not in LostPhones: the official steps you already took, and any report you may file later. Use official local reporting channels if you choose to report a theft. Do not paste IMEI, serial, locations, or a story into this page.',
      caution: 'Reporting is optional for stabilization. Do not delay safety or account protection for paperwork.',
      officialProvider: null,
      officialUrl: null,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: null,
      leavingLabel: null,
      planLane: 'later',
      boundedOutcomes: REPORT_OUTCOMES
    }),
    record({
      actionId: 'erase-device-decision',
      platform: 'iphone',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'Only after the iPhone is still missing, locate and Lost Mode are completed or safely exhausted, recovery looks unlikely, and material compromise risk exists. Dual confirmation required. Not shown merely because the phone is offline.',
      title: 'Consider erasing the iPhone only after reversible steps',
      reason: 'Erasing an iPhone can reduce data exposure, but it can also stop later location updates. Apple’s official Find Devices page is the only place to do this.',
      instruction: 'If you confirmed erase, open Apple Find Devices in a new tab and use Apple’s erase control there. Keep LostPhones available. Erase is irreversible on the missing iPhone and may prevent finding it later.',
      caution: 'Do not erase just because the iPhone is offline. LostPhones will not offer erase until reversible steps are done and you confirm twice.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'Apple Find Devices opens in a new tab for the official erase control. Keep LostPhones available and return afterward.',
      returnPrompt: 'When you are back, LostPhones will not treat erase as required for stabilization.',
      requiresExternalReturn: true,
      planLane: 'later',
      boundedOutcomes: ERASE_OUTCOMES
    }),
    record({
      actionId: 'erase-device-decision',
      platform: 'android',
      applicableSituations: ['lost', 'stolen', 'unsure'],
      applicableConditions: 'Only after the Android phone is still missing, locate and Secure Device are completed or safely exhausted, recovery looks unlikely, and material compromise risk exists. Dual confirmation required. Not shown merely because the phone is offline.',
      title: 'Consider erasing the Android phone only after reversible steps',
      reason: 'Erasing can reduce data exposure, but it can also stop later location updates. Google’s official Find Hub page is the only place to do this.',
      instruction: 'If you confirmed erase, open Google Find Hub in a new tab and use Google’s erase control there. Keep LostPhones available. Erase is irreversible on the missing phone and may prevent finding it later.',
      caution: 'Do not erase just because the phone is offline. LostPhones will not offer erase until reversible steps are done and you confirm twice.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'Google Find Hub opens in a new tab for the official erase control. Keep LostPhones available and return afterward.',
      returnPrompt: 'When you are back, LostPhones will not treat erase as required for stabilization.',
      requiresExternalReturn: true,
      planLane: 'later',
      boundedOutcomes: ERASE_OUTCOMES
    }),
    record({
      actionId: 'recovered-device-security-check',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'When the person says the iPhone is found. Confirms safe physical possession. Never encourages retrieval from an unsafe location.',
      title: 'Confirm you have the iPhone and it is safe to keep',
      reason: 'If the iPhone is back, stop missing-phone steps. Confirm it is in your hands in a safe place before reversing Lost Mode or checking for misuse.',
      instruction: 'Only continue if you physically have the iPhone and can keep it. If it is in an unsafe place, leave it and return to safety steps. If you have it, you can later turn off Lost Mode in Apple Find Devices.',
      caution: 'Never retrieve a phone from an unsafe location.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleFind,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple Find Devices',
      leavingLabel: 'If you need to turn off Lost Mode, Apple Find Devices opens in a new tab. Keep LostPhones available and return afterward.',
      returnPrompt: 'When you are back, LostPhones will ask whether anyone else may have used the iPhone.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: RECOVERED_CHECK_OUTCOMES
    }),
    record({
      actionId: 'recovered-device-security-check',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'When the person says the Android phone is found. Confirms safe physical possession. Never encourages retrieval from an unsafe location.',
      title: 'Confirm you have the phone and it is safe to keep',
      reason: 'If the phone is back, stop missing-phone steps. Confirm it is in your hands in a safe place before reversing lock settings or checking for misuse.',
      instruction: 'Only continue if you physically have the phone and can keep it. If it is in an unsafe place, leave it and return to safety steps. If you have it, you can later turn off lock settings in Google Find Hub.',
      caution: 'Never retrieve a phone from an unsafe location.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleFind,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google Find Hub',
      leavingLabel: 'If you need to turn off lock settings, Google Find Hub opens in a new tab. Keep LostPhones available and return afterward.',
      returnPrompt: 'When you are back, LostPhones will ask whether anyone else may have used the phone.',
      requiresExternalReturn: true,
      planLane: 'now',
      boundedOutcomes: RECOVERED_CHECK_OUTCOMES
    }),
    record({
      actionId: 'recovery-replacement-transition',
      platform: 'iphone',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Later orientation only. Not a purchase flow. Does not block stabilization.',
      title: 'Replacement and setup can wait until you are stable',
      reason: 'After the immediate risk is contained, you can think about a replacement or restoring from a backup. That is later work, not the current emergency.',
      instruction: 'Use Apple’s official support if you later replace the iPhone. LostPhones will not sell a phone, offer a paid PDF, or collect an IMEI here.',
      caution: 'Replacement is optional and does not have to happen now.',
      officialProvider: 'Apple',
      officialUrl: OFFICIAL_URLS.appleLostSupport,
      supportSourceUrl: OFFICIAL_URLS.appleLostSupport,
      primaryControlLabel: 'Open Apple lost-device support',
      leavingLabel: 'Apple support opens in a new tab. Keep LostPhones available if you want to return.',
      requiresExternalReturn: true,
      planLane: 'later',
      boundedOutcomes: REPLACEMENT_OUTCOMES
    }),
    record({
      actionId: 'recovery-replacement-transition',
      platform: 'android',
      applicableSituations: ['nearby', 'lost', 'stolen', 'unsure'],
      applicableConditions: 'Later orientation only. Not a purchase flow. Does not block stabilization.',
      title: 'Replacement and setup can wait until you are stable',
      reason: 'After the immediate risk is contained, you can think about a replacement or restoring from a backup. That is later work, not the current emergency.',
      instruction: 'Use Google’s official support if you later replace the phone. LostPhones will not sell a phone, offer a paid PDF, or collect an IMEI here.',
      caution: 'Replacement is optional and does not have to happen now.',
      officialProvider: 'Google',
      officialUrl: OFFICIAL_URLS.googleLostSupport,
      supportSourceUrl: OFFICIAL_URLS.googleLostSupport,
      primaryControlLabel: 'Open Google lost-device support',
      leavingLabel: 'Google support opens in a new tab. Keep LostPhones available if you want to return.',
      requiresExternalReturn: true,
      planLane: 'later',
      boundedOutcomes: REPLACEMENT_OUTCOMES
    })
  ]);

  const privacyGuidance = Object.freeze({
    trusted: Object.freeze({
      id: 'trusted',
      title: 'You are on a trusted device',
      items: Object.freeze([
        'Use the official Apple or Google service as you normally would.',
        'You can save a private resume token on this device for seven days.',
        'LostPhones never stores passwords, codes, or the missing phone’s location.'
      ])
    }),
    borrowed: Object.freeze({
      id: 'borrowed',
      title: 'Using a device from someone you trust',
      items: Object.freeze([
        'Use the phone owner’s account only.',
        'Do not save credentials.',
        'Sign out of the official service when finished.',
        'LostPhones keeps the current flow in this browser session unless you copy a private resume link.'
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
        'LostPhones will not save a resume token on this device.'
      ])
    })
  });

  const BLOCKED_REASON_COPY = Object.freeze({
    cannot_sign_in: 'This step is waiting because the official account could not be signed in. It is not complete. You can keep going with any safe step that does not need that sign-in.',
    cannot_receive_verification: 'This step is waiting because a verification code could not be received without the missing phone. It is not complete.',
    device_offline: 'The official service reported the phone offline. Location may still update later. This does not count as secured.',
    service_unavailable: 'The official service was unavailable. Try again from this page when you can. The step is not complete.',
    cannot_access_carrier: 'The carrier could not be reached through its official app or site yet. The line-protection step stays visible and is not complete.',
    waiting_for_provider: 'You are waiting on Apple, Google, a carrier, or a bank. That blocked step stays in Next until it finishes.',
    needs_owner: 'Only the phone owner can finish this step. It stays visible and is not complete.',
    unsafe_to_retrieve: 'Do not retrieve the phone from an unsafe place. Safety comes first, and this step is not complete.',
    could_not_secure_device: 'The phone could not be marked lost or locked. This security step is not complete.'
  });

  const PLAN_COPY = Object.freeze({
    now: 'Now — immediate safety and risk containment',
    next: 'Next — important follow-up after immediate control',
    later: 'Later — cleanup, reporting, and replacement when you are ready'
  });

  function getAction(actionId, platform) {
    return actions.find((item) => item.actionId === actionId && item.platform === platform) || null;
  }

  function getQuestion(id) {
    return QUESTIONS.find((item) => item.id === id) || null;
  }

  function getApprovedOfficialUrls() {
    return Object.freeze(Object.values(OFFICIAL_URLS));
  }

  function isExternalAction(actionId) {
    return EXTERNAL_ACTION_IDS.indexOf(actionId) !== -1;
  }

  return {
    REVIEW,
    OFFICIAL_URLS,
    APPROVED_ACTION_IDS,
    AUTH_RELEVANT_ACTION_IDS,
    EXTERNAL_ACTION_IDS,
    QUESTIONS,
    actions,
    privacyGuidance,
    BLOCKED_REASON_COPY,
    PLAN_COPY,
    getAction,
    getQuestion,
    getApprovedOfficialUrls,
    isExternalAction
  };
});
