(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LostPhonesPreparednessRecommendations = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GAPS = Object.freeze(['screen_protection', 'cloud_backup', 'password_security', 'travel_connectivity']);
  const PLATFORMS = Object.freeze(['any', 'iphone', 'android']);
  const COMMERCIAL_TYPES = Object.freeze(['amazon_associate', 'none']);
  const RECORD_FIELDS = Object.freeze([
    'id',
    'gap',
    'platform',
    'providerName',
    'destinationUrl',
    'commercialType',
    'disclosure',
    'active',
    'title',
    'copy',
    'priority'
  ]);

  const RECORDS = Object.freeze([
    Object.freeze({
      id: 'case-search-amazon',
      gap: 'screen_protection',
      platform: 'any',
      providerName: 'Amazon',
      destinationUrl: 'https://www.amazon.com/s?k=protective+phone+case&tag=lostphones-20',
      commercialType: 'amazon_associate',
      disclosure: 'We may earn a commission from qualifying purchases or referrals, at no extra cost to you.',
      active: true,
      title: 'Protective phone case',
      copy: 'A protective case can reduce damage if the phone is dropped.',
      priority: 1
    }),
    Object.freeze({
      id: 'screen-protector-search-amazon',
      gap: 'screen_protection',
      platform: 'any',
      providerName: 'Amazon',
      destinationUrl: 'https://www.amazon.com/s?k=tempered+glass+screen+protector&linkCode=ll2&tag=lostphones-20&linkId=3eee339ff3c37cac1f0e9f2d043fa096&language=en_US&ref_=as_li_ss_tl',
      commercialType: 'amazon_associate',
      disclosure: 'We may earn a commission from qualifying purchases or referrals, at no extra cost to you.',
      active: true,
      title: 'Screen protector',
      copy: 'An undamaged screen protector can reduce cracks. Open Amazon to browse tempered glass protectors.',
      priority: 2
    }),
    Object.freeze({
      id: 'icloud-backup-official',
      gap: 'cloud_backup',
      platform: 'iphone',
      providerName: 'Apple',
      destinationUrl: 'https://support.apple.com/guide/icloud/back-up-your-iphone-or-ipad-mmab848634c8/icloud',
      commercialType: 'none',
      disclosure: null,
      active: true,
      title: 'Turn on iCloud backup',
      copy: 'Use Apple’s official iCloud backup steps so photos and contacts can restore to a replacement iPhone.',
      priority: 1
    }),
    Object.freeze({
      id: 'android-backup-official',
      gap: 'cloud_backup',
      platform: 'android',
      providerName: 'Google',
      destinationUrl: 'https://support.google.com/android/answer/2819582',
      commercialType: 'none',
      disclosure: null,
      active: true,
      title: 'Turn on Android backup',
      copy: 'Use Google’s official backup steps so photos and contacts can restore to a replacement Android phone.',
      priority: 1
    }),
    Object.freeze({
      id: 'apple-passwords-official',
      gap: 'password_security',
      platform: 'iphone',
      providerName: 'Apple',
      destinationUrl: 'https://support.apple.com/guide/iphone/find-and-change-passwords-iphf9219d8c9/ios',
      commercialType: 'none',
      disclosure: null,
      active: true,
      title: 'Review Apple passwords',
      copy: 'Use Apple’s official password guide to review saved passwords and two-step verification.',
      priority: 1
    }),
    Object.freeze({
      id: 'google-password-manager-official',
      gap: 'password_security',
      platform: 'android',
      providerName: 'Google',
      destinationUrl: 'https://passwords.google.com/',
      commercialType: 'none',
      disclosure: null,
      active: true,
      title: 'Review Google Password Manager',
      copy: 'Use Google Password Manager to review unique passwords and two-step verification.',
      priority: 1
    }),
    Object.freeze({
      id: 'travel-connectivity-provider',
      gap: 'travel_connectivity',
      platform: 'any',
      providerName: 'Unassigned',
      destinationUrl: null,
      commercialType: 'none',
      disclosure: null,
      active: false,
      title: 'Travel connectivity',
      copy: 'A travel connectivity provider is not assigned yet.',
      priority: 1
    })
  ]);

  function unknownKeys(input, allowed) {
    return Object.keys(input || {}).filter((key) => allowed.indexOf(key) === -1);
  }

  function isHttpsUrl(value) {
    if (typeof value !== 'string' || !value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function validateRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { ok: false, error: 'invalid-record' };
    }
    if (unknownKeys(record, RECORD_FIELDS).length) {
      return { ok: false, error: 'unknown-field' };
    }
    if (typeof record.id !== 'string' || !record.id) return { ok: false, error: 'invalid-id' };
    if (GAPS.indexOf(record.gap) === -1) return { ok: false, error: 'invalid-gap' };
    if (PLATFORMS.indexOf(record.platform) === -1) return { ok: false, error: 'invalid-platform' };
    if (typeof record.providerName !== 'string' || !record.providerName) return { ok: false, error: 'invalid-provider' };
    if (COMMERCIAL_TYPES.indexOf(record.commercialType) === -1) return { ok: false, error: 'invalid-commercial-type' };
    if (typeof record.active !== 'boolean') return { ok: false, error: 'invalid-active' };
    if (typeof record.title !== 'string' || !record.title) return { ok: false, error: 'invalid-title' };
    if (typeof record.copy !== 'string' || !record.copy) return { ok: false, error: 'invalid-copy' };
    if (typeof record.priority !== 'number') return { ok: false, error: 'invalid-priority' };
    if (/best/i.test(record.title + ' ' + record.copy)) return { ok: false, error: 'forbidden-copy' };
    if (record.active) {
      if (!isHttpsUrl(record.destinationUrl)) return { ok: false, error: 'invalid-url' };
      if (record.commercialType === 'amazon_associate' && record.destinationUrl.indexOf('tag=lostphones-20') === -1) {
        return { ok: false, error: 'invalid-affiliate' };
      }
      if (record.commercialType === 'amazon_associate' && typeof record.disclosure !== 'string') {
        return { ok: false, error: 'missing-disclosure' };
      }
    } else if (record.destinationUrl != null && !isHttpsUrl(record.destinationUrl)) {
      return { ok: false, error: 'invalid-url' };
    }
    return { ok: true, record: record };
  }

  function getRecord(id) {
    return RECORDS.find((item) => item.id === id) || null;
  }

  function recordsForIds(ids) {
    const list = Array.isArray(ids) ? ids : [];
    return list.map(getRecord).filter(Boolean);
  }

  function displayableRecords(ids) {
    return recordsForIds(ids)
      .filter((record) => record.active && isHttpsUrl(record.destinationUrl))
      .sort((a, b) => a.priority - b.priority);
  }

  function linkRel(record) {
    if (record && record.commercialType && record.commercialType !== 'none') {
      return 'nofollow sponsored noopener noreferrer';
    }
    return 'noopener noreferrer';
  }

  RECORDS.forEach((record) => {
    const validated = validateRecord(record);
    if (!validated.ok) {
      throw new Error('invalid-recommendation:' + record.id + ':' + validated.error);
    }
  });

  return {
    GAPS,
    PLATFORMS,
    COMMERCIAL_TYPES,
    RECORD_FIELDS,
    RECORDS,
    validateRecord,
    getRecord,
    recordsForIds,
    displayableRecords,
    linkRel
  };
});
