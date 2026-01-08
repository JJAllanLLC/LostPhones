const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const DHRU_API_URL = 'https://api-client.imei.org/api/dhru';
const DHRU_API_KEY = 'tWkh1r3K3IWlxgTiXkJGVSyTIyT1hih8aZ1RJxuKQQ4I2PIBbl6DVVlQ0KoI';
const SERVICE_APPLE_ADVANCED = 171;
const SERVICE_GSMA_BLACKLIST = 30;

// Poll for DHRU order completion
async function pollDHRUOrder(reference, maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(DHRU_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ACTION: 'REFERENCES',
          APIKEY: DHRU_API_KEY,
          REFERENCE: reference
        })
      });

      if (!response.ok) {
        throw new Error(`DHRU API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if order is complete
      if (data.STATUS === 'SUCCESS' || data.STATUS === 'COMPLETED') {
        return data;
      }
      
      // If still processing, wait and retry
      if (data.STATUS === 'PROCESSING' || data.STATUS === 'PENDING') {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // If failed or error
      if (data.STATUS === 'FAILED' || data.STATUS === 'ERROR') {
        throw new Error(data.MESSAGE || 'Order failed');
      }

      // Default: wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      // On last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      // Otherwise wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error('Order polling timeout');
}

// Place a DHRU order and wait for completion
async function placeAndPollDHRUOrder(imei, serviceId) {
  try {
    // Place order
    const placeOrderResponse = await fetch(DHRU_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ACTION: 'PLACEORDER',
        APIKEY: DHRU_API_KEY,
        SERVICE: serviceId,
        IMEI: imei
      })
    });

    if (!placeOrderResponse.ok) {
      throw new Error(`Failed to place order: ${placeOrderResponse.status}`);
    }

    const placeOrderData = await placeOrderResponse.json();
    
    if (placeOrderData.ERROR) {
      throw new Error(placeOrderData.MESSAGE || 'Failed to place order');
    }

    const reference = placeOrderData.REFERENCE || placeOrderData.ORDERID;
    if (!reference) {
      throw new Error('No reference returned from order placement');
    }

    // Poll for completion
    const result = await pollDHRUOrder(reference);
    return result;
  } catch (error) {
    console.error(`DHRU order error (Service ${serviceId}):`, error);
    throw error;
  }
}

// Parse Apple Advanced report for FMI and iCloud Lost status
function parseAppleAdvanced(data) {
  const report = {
    fmi: null,
    icloudLost: null,
    clean: true
  };

  // Look for FMI status (Find My iPhone)
  const fmiStatus = data.FMI || data.FIND_MY || data['Find My'] || 
                    data.FMI_STATUS || data.FIND_MY_IPHONE;
  
  if (fmiStatus) {
    const fmiLower = String(fmiStatus).toLowerCase();
    if (fmiLower.includes('on') || fmiLower === 'enabled' || fmiLower === 'yes' || fmiLower === '1') {
      report.fmi = 'ON';
    } else if (fmiLower.includes('off') || fmiLower === 'disabled' || fmiLower === 'no' || fmiLower === '0') {
      report.fmi = 'OFF';
    }
  }

  // Look for Lost Mode / iCloud Lost status
  const lostMode = data.LOST_MODE || data.LOST || data.ICLOUD_LOST || 
                   data['Lost Mode'] || data.ICLOUD_LOST_MODE;
  
  if (lostMode) {
    const lostLower = String(lostMode).toLowerCase();
    if (lostLower.includes('on') || lostLower === 'enabled' || lostLower === 'yes' || 
        lostLower.includes('active') || lostLower === '1') {
      report.icloudLost = true;
      report.clean = false;
    } else {
      report.icloudLost = false;
    }
  }

  // Check response text for keywords if structured fields not found
  const responseText = JSON.stringify(data).toLowerCase();
  if (responseText.includes('lost mode') && 
      (responseText.includes('on') || responseText.includes('active') || responseText.includes('enabled'))) {
    report.icloudLost = true;
    report.clean = false;
  }

  return report;
}

// Parse GSMA Blacklist report
function parseGSMABlacklist(data) {
  const report = {
    blacklisted: false,
    clean: true
  };

  // Look for blacklist status
  const blacklistStatus = data.STATUS || data.BLACKLIST_STATUS || data.BLACKLIST || 
                         data.GSMA_STATUS || data['Blacklist Status'];
  
  if (blacklistStatus) {
    const statusLower = String(blacklistStatus).toLowerCase();
    if (statusLower.includes('blacklist') || statusLower.includes('blocked') || 
        statusLower.includes('barred') || statusLower.includes('stolen') || 
        statusLower.includes('lost')) {
      report.blacklisted = true;
      report.clean = false;
    } else if (statusLower.includes('clean') || statusLower.includes('whitelist') || 
               statusLower.includes('clear') || statusLower.includes('active')) {
      report.blacklisted = false;
    }
  }

  // Check response text for keywords
  const responseText = JSON.stringify(data).toLowerCase();
  if (responseText.includes('blacklist') && 
      (responseText.includes('yes') || responseText.includes('true') || 
       responseText.includes('blocked') || responseText.includes('stolen'))) {
    report.blacklisted = true;
    report.clean = false;
  }

  return report;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get IMEI from metadata
    const imei = session.metadata?.imei;

    if (!imei) {
      return res.status(400).json({ error: 'IMEI not found in session metadata' });
    }

    // Place both DHRU orders in parallel
    const [appleAdvancedResult, gsmaBlacklistResult] = await Promise.allSettled([
      placeAndPollDHRUOrder(imei, SERVICE_APPLE_ADVANCED),
      placeAndPollDHRUOrder(imei, SERVICE_GSMA_BLACKLIST)
    ]);

    // Parse results
    const appleReport = appleAdvancedResult.status === 'fulfilled' 
      ? parseAppleAdvanced(appleAdvancedResult.value)
      : { fmi: null, icloudLost: null, clean: true, error: appleAdvancedResult.reason?.message };

    const gsmaReport = gsmaBlacklistResult.status === 'fulfilled'
      ? parseGSMABlacklist(gsmaBlacklistResult.value)
      : { blacklisted: false, clean: true, error: gsmaBlacklistResult.reason?.message };

    // Determine overall status
    const hasIssue = !appleReport.clean || !gsmaReport.clean;
    const hasError = appleReport.error || gsmaReport.error;

    // Generate plain-English summary
    let summary = '';
    if (hasError) {
      summary = 'We encountered an issue retrieving your report. Please contact support if you need assistance.';
    } else if (!hasIssue) {
      summary = 'Good news — your device is clean and not reported lost or blacklisted.';
    } else {
      const issues = [];
      if (appleReport.icloudLost) {
        issues.push('reported lost via iCloud/Lost Mode');
      }
      if (gsmaReport.blacklisted) {
        issues.push('blacklisted');
      }
      summary = `Your device has been flagged: ${issues.join(' and ')}. Please contact support for assistance.`;
    }

    // Return structured response
    return res.status(200).json({
      success: true,
      imei: imei,
      apple: {
        fmi: appleReport.fmi,
        icloudLost: appleReport.icloudLost,
        clean: appleReport.clean,
        error: appleReport.error || null
      },
      gsma: {
        blacklisted: gsmaReport.blacklisted,
        clean: gsmaReport.clean,
        error: gsmaReport.error || null
      },
      overallClean: !hasIssue && !hasError,
      summary: summary
    });

  } catch (error) {
    console.error('Error fetching IMEI report:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch IMEI report',
      message: error.message 
    });
  }
}

