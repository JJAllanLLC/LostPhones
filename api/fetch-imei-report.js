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
async function pollOrder(orderId, maxAttempts = 90, delayMs = 2000) {
  const url = `https://api-client.imei.org/api/track?apikey=${IMEI_API_KEY}&id=${orderId}`;
  
  console.log(`=== Polling order ${orderId} ===`);
  console.log('Poll URL:', url);
  console.log(`Max attempts: ${maxAttempts}, Delay: ${delayMs}ms`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        const status = 'ERROR';
        console.log('Polling attempt ' + (attempt + 1) + ' of ' + maxAttempts + ' - status: ' + status);
        console.error(`Poll attempt ${attempt + 1} failed:`, response.status, errorText);
        // Continue polling on non-200 responses (might be temporary)
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw new Error(`Poll failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Check if order is complete with status 1 + response presence (imei.org complete format)
      if (data.status === 1 && data.response && typeof data.response === 'object' && Object.keys(data.response).length > 0) {
        console.log('Detected complete: status 1 with response data present');
        console.log(`Order ${orderId} completed successfully on attempt ${attempt + 1}`);
        console.log('Final poll response:', JSON.stringify(data, null, 2));
        // Return the response data directly (contains the full report)
        return data.response;
      }
      
      // Check if order is complete
      const status = data.status || data.STATUS || data.state || data.STATE;
      const statusLower = String(status || '').toLowerCase();
      const statusUpper = String(status || '').toUpperCase();
      
      // Add debug logs for every attempt
      console.log('Poll attempt ' + attempt + ' - raw status: ' + status);
      console.log('Poll response data: ' + JSON.stringify(data));
      
      // Expanded completed status detection: "Done", "done", "Success", "success", "Completed", "completed", "Finished", "finished", "1", "true"
      const isCompleted = statusLower === 'completed' || statusLower === 'success' || 
                         statusLower === 'done' || statusLower === 'finished' ||
                         statusUpper === 'DONE' || statusUpper === 'SUCCESS' || 
                         statusUpper === 'COMPLETED' || statusUpper === 'FINISHED' ||
                         status === '1' || status === 1 || statusLower === 'true' ||
                         data.completed === true || data.success === true ||
                         data.completed === 1 || data.success === 1 ||
                         String(data.completed || '').toLowerCase() === 'true' ||
                         String(data.success || '').toLowerCase() === 'true';
      
      if (isCompleted) {
        console.log(`Order ${orderId} completed successfully on attempt ${attempt + 1}`);
        console.log('Final poll response:', JSON.stringify(data, null, 2));
        // Immediately return the result data (no further polling)
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

// Parse Apple Advanced report for FMI, iCloud Lost status, blacklist, and all device details
function parseAppleAdvanced(data) {
  const report = {
    fmi: null,
    fmiStatus: null, // "Lost Mode Active" or "Clean" for display
    icloudLost: null,
    blacklisted: false,
    blacklistStatus: null, // "BLACKLISTED" or "CLEAN" for display
    clean: true,
    details: {}, // Additional device info (model, serial, warranty, carrier, simlock, etc.)
    raw: data
  };

  // Convert data to string for searching
  const dataStr = JSON.stringify(data).toLowerCase();
  const dataObj = typeof data === 'object' ? data : {};

  // Extract additional device details
  const fields = ['Model', 'MODEL', 'model', 'deviceModel', 'Device Model',
                  'Serial', 'SERIAL', 'serial', 'serialNumber', 'Serial Number',
                  'Warranty', 'WARRANTY', 'warranty', 'warrantyStatus', 'Warranty Status',
                  'Carrier', 'CARRIER', 'carrier', 'carrierName', 'Carrier Name',
                  'Simlock', 'SIMLOCK', 'simlock', 'simLock', 'Sim Lock', 'SIM_LOCK',
                  'IMEI', 'imei',
                  'Storage', 'STORAGE', 'storage', 'capacity',
                  'Color', 'COLOR', 'color',
                  'Purchase Date', 'purchaseDate', 'PURCHASE_DATE'];
  
  fields.forEach(field => {
    const value = dataObj[field];
    if (value !== undefined && value !== null && value !== '') {
      const displayKey = field.toLowerCase().replace(/\s+/g, '_');
      if (!report.details[displayKey]) {
        report.details[displayKey] = String(value);
      }
    }
  });

  // Also check for nested objects and arrays
  if (dataObj.data && typeof dataObj.data === 'object') {
    Object.keys(dataObj.data).forEach(key => {
      const value = dataObj.data[key];
      if (value !== undefined && value !== null && value !== '') {
        const displayKey = key.toLowerCase().replace(/\s+/g, '_');
        if (!report.details[displayKey]) {
          report.details[displayKey] = String(value);
        }
      }
    });
  }

  // Look for FMI status (Find My iPhone)
  const fmiStatus = dataObj.FMI || dataObj.FIND_MY || dataObj['Find My'] || 
                    dataObj.FMI_STATUS || dataObj.FIND_MY_IPHONE || dataObj.fmi ||
                    dataObj.findMy || dataObj.find_my || dataObj.data?.FMI || dataObj.data?.FIND_MY;
  
  if (fmiStatus !== undefined && fmiStatus !== null) {
    const fmiLower = String(fmiStatus).toUpperCase();
    if (fmiLower === 'ON' || fmiLower.includes('ON') || fmiLower === 'ENABLED' || 
        fmiLower === 'YES' || fmiLower === '1' || fmiLower === 'TRUE') {
      report.fmi = 'ON';
      // Check if Lost Mode is also active
      const lostMode = dataObj.LOST_MODE || dataObj.LOST || dataObj.ICLOUD_LOST || 
                       dataObj['Lost Mode'] || dataObj.ICLOUD_LOST_MODE || dataObj.data?.LOST_MODE;
      if (lostMode !== undefined && lostMode !== null) {
        const lostLower = String(lostMode).toUpperCase();
        if (lostLower === 'ON' || lostLower.includes('ON') || lostLower === 'ACTIVE' || 
            lostLower === 'ENABLED' || lostLower === 'YES' || lostLower === 'TRUE' || lostLower === '1') {
          report.fmiStatus = 'Lost Mode Active'; // Red status
          report.icloudLost = true;
          report.clean = false;
        } else {
          report.fmiStatus = 'Clean'; // Green status
          report.icloudLost = false;
        }
      } else {
        report.fmiStatus = 'Clean'; // Green status
        report.icloudLost = false;
      }
    } else if (fmiLower === 'OFF' || fmiLower.includes('OFF') || fmiLower === 'DISABLED' || 
               fmiLower === 'NO' || fmiLower === '0' || fmiLower === 'FALSE') {
      report.fmi = 'OFF';
      report.fmiStatus = 'Clean'; // Green status
      report.icloudLost = false;
    }
  } else {
    // Look for Lost Mode / iCloud Lost status directly
    const lostMode = dataObj.LOST_MODE || dataObj.LOST || dataObj.ICLOUD_LOST || 
                     dataObj['Lost Mode'] || dataObj.ICLOUD_LOST_MODE || dataObj.lostMode ||
                     dataObj.lost_mode || dataObj.icloudLost || dataObj.icloud_lost ||
                     dataObj.data?.LOST_MODE || dataObj.data?.ICLOUD_LOST;
    
    if (lostMode !== undefined && lostMode !== null) {
      const lostLower = String(lostMode).toUpperCase();
      if (lostLower === 'ON' || lostLower.includes('ON') || lostLower === 'ACTIVE' || 
          lostLower === 'ENABLED' || lostLower === 'YES' || lostLower === 'TRUE' || lostLower === '1') {
        report.fmiStatus = 'Lost Mode Active'; // Red status
        report.icloudLost = true;
        report.clean = false;
      } else {
        report.fmiStatus = 'Clean'; // Green status
        report.icloudLost = false;
      }
    }
  }

  // Look for blacklist status (included in Apple Advanced Check)
  const blacklistStatus = dataObj.BLACKLIST || dataObj.BLACKLIST_STATUS || dataObj.STATUS || 
                         dataObj.GSMA_STATUS || dataObj['Blacklist Status'] || dataObj.Blacklist ||
                         dataObj.blacklist || dataObj.blacklisted || dataObj.gsma_status || 
                         dataObj.gsma_blacklist || dataObj.data?.BLACKLIST || dataObj.data?.BLACKLIST_STATUS;
  
  if (blacklistStatus !== undefined && blacklistStatus !== null) {
    const statusUpper = String(blacklistStatus).toUpperCase();
    if (statusUpper === 'BLACKLISTED' || statusUpper.includes('BLACKLIST') || 
        statusUpper.includes('BLOCKED') || statusUpper.includes('BARRED') || 
        statusUpper.includes('STOLEN') || statusUpper.includes('LOST') || 
        statusUpper === 'YES' || statusUpper === 'TRUE' || statusUpper === '1') {
      report.blacklistStatus = 'BLACKLISTED'; // Red status
      report.blacklisted = true;
      report.clean = false;
    } else if (statusUpper === 'CLEAN' || statusUpper.includes('CLEAN') || 
               statusUpper.includes('WHITELIST') || statusUpper.includes('CLEAR') ||
               statusUpper === 'NO' || statusUpper === 'FALSE' || statusUpper === '0') {
      report.blacklistStatus = 'CLEAN'; // Green status
      report.blacklisted = false;
    }
  }

  // Check response text for keywords if structured fields not found
  if (dataStr.includes('lost mode') && 
      (dataStr.includes('on') || dataStr.includes('active') || dataStr.includes('enabled'))) {
    if (!report.fmiStatus) {
      report.fmiStatus = 'Lost Mode Active'; // Red status
    }
    report.icloudLost = true;
    report.clean = false;
  }
  
  if (dataStr.includes('find my') && 
      (dataStr.includes('on') || dataStr.includes('enabled') || dataStr.includes('yes'))) {
    if (report.fmi === null) {
      report.fmi = 'ON';
    }
    if (!report.fmiStatus) {
      report.fmiStatus = 'Clean'; // Green status
    }
  }

  // Check for blacklist in response text
  if (dataStr.includes('blacklist') && 
      (dataStr.includes('yes') || dataStr.includes('true') || 
       dataStr.includes('blocked') || dataStr.includes('stolen') ||
       dataStr.includes('barred'))) {
    if (!report.blacklistStatus) {
      report.blacklistStatus = 'BLACKLISTED'; // Red status
    }
    report.blacklisted = true;
    report.clean = false;
  }

  // Set default statuses if not set
  if (!report.fmiStatus && report.fmi === 'ON' && !report.icloudLost) {
    report.fmiStatus = 'Clean'; // Green status
  } else if (!report.fmiStatus && report.fmi === null) {
    report.fmiStatus = null;
  }

  if (!report.blacklistStatus && !report.blacklisted) {
    report.blacklistStatus = 'CLEAN'; // Green status
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
        fmiStatus: appleReport.fmiStatus, // "Lost Mode Active" or "Clean" for display
        icloudLost: appleReport.icloudLost,
        clean: appleReport.clean,
        error: appleReport.error || null,
        details: appleReport.details || {} // Model, serial, warranty, carrier, simlock, etc.
      },
      gsma: {
        blacklisted: appleReport.blacklisted,
        blacklistStatus: appleReport.blacklistStatus, // "BLACKLISTED" or "CLEAN" for display
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
