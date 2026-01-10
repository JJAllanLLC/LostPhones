const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const IMEI_API_KEY = 'tWkh1r3K3IWlxgTiXkJGVSyTIyT1hih8aZ1RJxuKQQ4I2PIBbl6DVVlQ0KoI';
const SERVICE_APPLE_ADVANCED = 50;

// Submit an order to imei.org API
async function submitOrder(imei) {
  const url = `https://api-client.imei.org/api/submit?apikey=${IMEI_API_KEY}&service_id=50&input=${encodeURIComponent(imei)}&dontWait=1`;
  
  console.log('Submitting to service_id: 50 for IMEI: ' + imei);
  console.log('Full submit URL: ' + url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('Submit response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Submit error response:', errorText);
      throw new Error(`Failed to submit order: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API response: ' + JSON.stringify(data));
    console.log('Submit response data:', JSON.stringify(data, null, 2));
    
    // Extract orderId from response
    const orderId = data.id || data.orderId || data.order_id || data.ID || data.ORDERID;
    
    if (!orderId) {
      console.error('No orderId in response:', data);
      throw new Error('No order ID returned from API');
    }
    
    console.log('Order submitted successfully. Order ID:', orderId);
    return orderId;
  } catch (error) {
    console.error('Error submitting order (Service 50):', error);
    throw error;
  }
}

// Poll for order completion
async function pollOrder(orderId, maxAttempts = 30, delayMs = 2000) {
  const url = `https://api-client.imei.org/api/track?apikey=${IMEI_API_KEY}&id=${orderId}`;
  
  console.log(`=== Polling order ${orderId} ===`);
  console.log('Poll URL:', url);
  console.log(`Max attempts: ${maxAttempts}, Delay: ${delayMs}ms`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt === 0) {
        console.log('Starting poll attempt 1...');
      } else if (attempt % 5 === 0) {
        console.log(`Poll attempt ${attempt + 1}/${maxAttempts}...`);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Poll attempt ${attempt + 1} failed:`, response.status, errorText);
        // Continue polling on non-200 responses (might be temporary)
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw new Error(`Poll failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (attempt === 0 || attempt % 5 === 0) {
        console.log(`Poll attempt ${attempt + 1} response:`, JSON.stringify(data, null, 2));
      }
      
      // Check if order is complete
      const status = data.status || data.STATUS || data.state || data.STATE;
      const statusLower = String(status || '').toLowerCase();
      
      if (statusLower === 'completed' || statusLower === 'success' || statusLower === 'done' || 
          statusLower === 'finished' || data.completed || data.success) {
        console.log(`Order ${orderId} completed successfully on attempt ${attempt + 1}`);
        console.log('Final poll response:', JSON.stringify(data, null, 2));
        return data;
      }
      
      // If still processing, wait and retry
      if (statusLower === 'processing' || statusLower === 'pending' || statusLower === 'in_progress' ||
          statusLower === 'queued' || statusLower === 'waiting') {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      // If failed or error
      if (statusLower === 'failed' || statusLower === 'error' || statusLower === 'cancelled') {
        const errorMsg = data.message || data.error || data.MESSAGE || 'Order failed';
        console.error(`Order ${orderId} failed with status:`, status, errorMsg);
        throw new Error(errorMsg);
      }

      // Default: wait and retry (unknown status)
      console.log(`Unknown status "${status}", retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      // On last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        console.error('Polling failed after all attempts:', error);
        throw error;
      }
      // Otherwise wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.error(`Polling timeout for order ${orderId} after ${maxAttempts} attempts`);
  throw new Error('Order polling timeout');
}

// Submit order and poll for completion
async function submitAndPollOrder(imei) {
  try {
    const orderId = await submitOrder(imei);
    const result = await pollOrder(orderId);
    return result;
  } catch (error) {
    console.error('Order error (Service 50, IMEI: ' + imei + '):', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

// Parse Apple Advanced report for FMI, iCloud Lost status, and blacklist
function parseAppleAdvanced(data) {
  const report = {
    fmi: null,
    icloudLost: null,
    blacklisted: false,
    clean: true,
    raw: data
  };

  // Convert data to string for searching
  const dataStr = JSON.stringify(data).toLowerCase();
  const dataObj = typeof data === 'object' ? data : {};

  // Look for FMI status (Find My iPhone)
  const fmiStatus = dataObj.FMI || dataObj.FIND_MY || dataObj['Find My'] || 
                    dataObj.FMI_STATUS || dataObj.FIND_MY_IPHONE || dataObj.fmi ||
                    dataObj.findMy || dataObj.find_my;
  
  if (fmiStatus !== undefined && fmiStatus !== null) {
    const fmiLower = String(fmiStatus).toLowerCase();
    if (fmiLower.includes('on') || fmiLower === 'enabled' || fmiLower === 'yes' || 
        fmiLower === '1' || fmiLower === 'true') {
      report.fmi = 'ON';
    } else if (fmiLower.includes('off') || fmiLower === 'disabled' || 
               fmiLower === 'no' || fmiLower === '0' || fmiLower === 'false') {
      report.fmi = 'OFF';
    }
  }

  // Look for Lost Mode / iCloud Lost status
  const lostMode = dataObj.LOST_MODE || dataObj.LOST || dataObj.ICLOUD_LOST || 
                   dataObj['Lost Mode'] || dataObj.ICLOUD_LOST_MODE || dataObj.lostMode ||
                   dataObj.lost_mode || dataObj.icloudLost || dataObj.icloud_lost;
  
  if (lostMode !== undefined && lostMode !== null) {
    const lostLower = String(lostMode).toLowerCase();
    if (lostLower.includes('on') || lostLower === 'enabled' || lostLower === 'yes' || 
        lostLower.includes('active') || lostLower === '1' || lostLower === 'true') {
      report.icloudLost = true;
      report.clean = false;
    } else {
      report.icloudLost = false;
    }
  }

  // Look for blacklist status (included in Apple Advanced Check)
  const blacklistStatus = dataObj.STATUS || dataObj.BLACKLIST_STATUS || dataObj.BLACKLIST || 
                         dataObj.GSMA_STATUS || dataObj['Blacklist Status'] || dataObj.blacklist ||
                         dataObj.blacklisted || dataObj.gsma_status || dataObj.gsma_blacklist;
  
  if (blacklistStatus !== undefined && blacklistStatus !== null) {
    const statusLower = String(blacklistStatus).toLowerCase();
    if (statusLower.includes('blacklist') || statusLower.includes('blocked') || 
        statusLower.includes('barred') || statusLower.includes('stolen') || 
        statusLower.includes('lost') || statusLower.includes('yes') ||
        statusLower === 'true' || statusLower === '1') {
      report.blacklisted = true;
      report.clean = false;
    } else if (statusLower.includes('clean') || statusLower.includes('whitelist') || 
               statusLower.includes('clear') || statusLower.includes('active') ||
               statusLower.includes('no') || statusLower === 'false' || statusLower === '0') {
      report.blacklisted = false;
    }
  }

  // Check response text for keywords if structured fields not found
  if (dataStr.includes('lost mode') && 
      (dataStr.includes('on') || dataStr.includes('active') || dataStr.includes('enabled'))) {
    report.icloudLost = true;
    report.clean = false;
  }
  
  if (dataStr.includes('find my') && 
      (dataStr.includes('on') || dataStr.includes('enabled') || dataStr.includes('yes'))) {
    if (report.fmi === null) {
      report.fmi = 'ON';
    }
  }

  // Check for blacklist in response text
  if (dataStr.includes('blacklist') && 
      (dataStr.includes('yes') || dataStr.includes('true') || 
       dataStr.includes('blocked') || dataStr.includes('stolen') ||
       dataStr.includes('barred'))) {
    report.blacklisted = true;
    report.clean = false;
  }

  // If Lost Mode is active or blacklisted, device is not clean
  if (report.icloudLost === true || report.blacklisted === true) {
    report.clean = false;
  }

  console.log('Parsed Apple Advanced report:', JSON.stringify(report, null, 2));
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

    console.log('=== Fetching IMEI Report ===');
    console.log('Session ID:', session_id);

    // Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) {
      console.error('Session not found:', session_id);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get IMEI from metadata
    const imei = session.metadata?.imei;

    if (!imei) {
      console.error('IMEI not found in session metadata:', session.metadata);
      return res.status(400).json({ error: 'IMEI not found in session metadata' });
    }

    console.log('IMEI from session:', imei);

    // Submit and poll single order with service_id 50 (Apple Advanced Check includes everything)
    let appleReport;
    try {
      const appleAdvancedResult = await submitAndPollOrder(imei);
      appleReport = parseAppleAdvanced(appleAdvancedResult);
    } catch (error) {
      console.error('Error submitting/polling Apple Advanced Check:', error);
      appleReport = {
        fmi: null,
        icloudLost: null,
        blacklisted: false,
        clean: true,
        error: error.message || 'Unknown error',
        raw: null
      };
    }

    // Log parsed results
    console.log('=== Final Parsed Results ===');
    console.log('Apple Advanced:', JSON.stringify(appleReport, null, 2));

    // Determine overall status
    const hasIssue = !appleReport.clean;
    const hasError = appleReport.error;

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
      if (appleReport.blacklisted) {
        issues.push('blacklisted');
      }
      summary = `Your device has been flagged: ${issues.join(' and ')}. Please contact support for assistance.`;
    }

    console.log('Summary:', summary);
    console.log('Overall clean:', !hasIssue && !hasError);

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
        blacklisted: appleReport.blacklisted,
        clean: !appleReport.blacklisted,
        error: null
      },
      overallClean: !hasIssue && !hasError,
      summary: summary
    });

  } catch (error) {
    console.error('Error fetching IMEI report:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch IMEI report',
      message: error.message 
    });
  }
}
