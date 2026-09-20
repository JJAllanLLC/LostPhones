(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesPreparednessContent = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CATEGORIES = Object.freeze([
    Object.freeze({
      id: 'screen_protection',
      answerId: 'screenProtection',
      title: 'Screen protection',
      protectedCopy: 'Your phone already has a case and an undamaged screen protector.',
      notSureCopy: 'Check this item when you can. LostPhones is not recommending a product here.',
      needsSetupCopy: 'Add a protective case and an undamaged screen protector.',
      missingCopy: 'Confirm whether this phone has a protective case and an undamaged screen protector.'
    }),
    Object.freeze({
      id: 'cloud_backup',
      answerId: 'cloudBackup',
      title: 'Cloud backup',
      protectedCopy: 'Photos and contacts would restore automatically if this phone disappeared today.',
      notSureCopy: 'Check the official backup setting for this phone. LostPhones is not recommending a product here.',
      needsSetupCopy: 'Turn on automatic backup so photos and contacts can restore.',
      missingCopy: 'Confirm whether photos and contacts would restore automatically.'
    }),
    Object.freeze({
      id: 'password_security',
      answerId: 'passwordSecurity',
      title: 'Password security',
      protectedCopy: 'Unique passwords and two-step verification are already in use.',
      notSureCopy: 'Check unique passwords and two-step verification when you can. LostPhones is not recommending a product here.',
      needsSetupCopy: 'Set up unique passwords and two-step verification.',
      missingCopy: 'Confirm whether unique passwords and two-step verification are in use.'
    }),
    Object.freeze({
      id: 'travel_connectivity',
      answerId: 'travelConnectivity',
      title: 'Travel connectivity',
      protectedCopy: 'A backup way to get mobile data is already in place, or it is not needed now.',
      notSureCopy: 'Check whether you have a backup way to get mobile data if the main SIM stops working. LostPhones is not recommending a product here.',
      needsSetupCopy: 'Set up a backup way to get mobile data when you travel.',
      missingCopy: 'Confirm whether a backup way to get mobile data is needed.'
    })
  ]);

  const QUESTIONS = Object.freeze([
    Object.freeze({
      id: 'platform',
      title: 'Which kind of phone do you use most?',
      help: 'Choose one option. LostPhones does not collect a phone number or account.',
      choices: Object.freeze([
        Object.freeze({ id: 'iphone', label: 'iPhone' }),
        Object.freeze({ id: 'android', label: 'Android' }),
        Object.freeze({ id: 'other', label: 'Another kind' }),
        Object.freeze({ id: 'not_sure', label: 'Not sure' })
      ])
    }),
    Object.freeze({
      id: 'screenProtection',
      title: 'Does your phone have both a protective case and an undamaged screen protector?',
      help: 'Choose one option. There is no free-text field.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'not_sure', label: 'Not sure' })
      ])
    }),
    Object.freeze({
      id: 'cloudBackup',
      title: 'If this phone disappeared today, would your photos and contacts restore automatically?',
      help: 'Choose one option. LostPhones never asks for account details.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'not_sure', label: 'Not sure' })
      ])
    }),
    Object.freeze({
      id: 'passwordSecurity',
      title: 'Do you use unique passwords and two-step verification, preferably with a password manager?',
      help: 'Choose one option. LostPhones never asks for passwords or codes.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'not_sure', label: 'Not sure' })
      ])
    }),
    Object.freeze({
      id: 'travelConnectivity',
      title: 'When you travel, do you have a backup way to get mobile data if your main SIM stops working?',
      help: 'Choose one option. There is no commercial recommendation unless a gap is established.',
      choices: Object.freeze([
        Object.freeze({ id: 'yes', label: 'Yes' }),
        Object.freeze({ id: 'not_needed_now', label: 'Not needed now' }),
        Object.freeze({ id: 'no', label: 'No' }),
        Object.freeze({ id: 'not_sure', label: 'Not sure' })
      ])
    })
  ]);

  const PAGE_DISCLOSURE = 'As an Amazon Associate, LostPhones earns from qualifying purchases.';
  const CARD_DISCLOSURE = 'We may earn a commission from qualifying purchases or referrals, at no extra cost to you.';
  const NEUTRAL_MISSING = 'Ask your carrier whether your phone supports an eSIM or another backup data option.';

  function getQuestion(id) {
    return QUESTIONS.find((item) => item.id === id) || null;
  }

  function getCategory(id) {
    return CATEGORIES.find((item) => item.id === id) || null;
  }

  return {
    CATEGORIES,
    QUESTIONS,
    PAGE_DISCLOSURE,
    CARD_DISCLOSURE,
    NEUTRAL_MISSING,
    getQuestion,
    getCategory
  };
});
