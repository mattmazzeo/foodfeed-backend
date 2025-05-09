const express = require('express');
const { createLinkToken, exchangePublicToken } = require('../../plaid/plaidService');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './config/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const router = express.Router();

/**
 * Create a link token for initializing Plaid Link
 * POST /api/plaid/create-link-token
 */
router.post('/create-link-token', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    
    const linkToken = await createLinkToken(user_id);
    
    res.json({ link_token: linkToken });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

/**
 * Exchange a public token for an access token
 * POST /api/plaid/exchange-public-token
 */
router.post('/exchange-public-token', async (req, res) => {
  try {
    const { public_token, user_id } = req.body;
    
    if (!public_token || !user_id) {
      return res.status(400).json({ error: 'public_token and user_id are required' });
    }
    
    const { accessToken, itemId } = await exchangePublicToken(public_token);
    
    const { data, error } = await supabase
      .from('plaid_items')
      .insert({
        user_id,
        item_id: itemId,
        access_token: accessToken,
        status: 'ACTIVE'
      });
    
    if (error) {
      console.error('Error storing access token:', error);
      return res.status(500).json({ error: 'Failed to store access token' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

/**
 * Handle webhook events from Plaid
 * POST /api/plaid/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookEvent = req.body;
    
    processWebhook(webhookEvent).catch(error => {
      console.error('Error processing webhook:', error);
    });
    
    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Failed to handle webhook' });
  }
});

/**
 * Process a webhook event asynchronously
 * @param {Object} webhookEvent - The webhook event from Plaid
 */
async function processWebhook(webhookEvent) {
  const { handleWebhook } = require('../../plaid/webhookHandler');
  await handleWebhook(webhookEvent);
}

module.exports = router;
