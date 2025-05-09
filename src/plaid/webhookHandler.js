const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { getRecentTransactions } = require('./plaidService');
const { processTransactions, createFeedItems } = require('./transactionFilterService');

dotenv.config({ path: './config/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Handle webhook events from Plaid
 * @param {Object} webhookEvent - The webhook event from Plaid
 * @returns {Promise<void>}
 */
async function handleWebhook(webhookEvent) {
  try {
    console.log('Received webhook:', webhookEvent);
    
    const { webhook_type, webhook_code, item_id } = webhookEvent;
    
    switch (webhook_type) {
      case 'TRANSACTIONS':
        await handleTransactionsWebhook(webhookEvent);
        break;
      
      case 'ITEM':
        await handleItemWebhook(webhookEvent);
        break;
      
      default:
        console.log(`Unhandled webhook type: ${webhook_type}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error handling webhook:', error);
    throw error;
  }
}

/**
 * Handle transactions webhooks
 * @param {Object} webhookEvent - The webhook event from Plaid
 * @returns {Promise<void>}
 */
async function handleTransactionsWebhook(webhookEvent) {
  const { webhook_code, item_id } = webhookEvent;
  
  const { data: items, error: itemError } = await supabase
    .from('plaid_items')
    .select('user_id, access_token')
    .eq('item_id', item_id)
    .single();
  
  if (itemError || !items) {
    console.error('Error finding item:', itemError);
    return;
  }
  
  const { user_id, access_token } = items;
  
  switch (webhook_code) {
    case 'INITIAL_UPDATE':
    case 'HISTORICAL_UPDATE':
    case 'DEFAULT_UPDATE':
      await fetchAndStoreTransactions(user_id, access_token);
      break;
    
    case 'TRANSACTIONS_REMOVED':
      await handleRemovedTransactions(webhookEvent, user_id);
      break;
    
    default:
      console.log(`Unhandled transactions webhook code: ${webhook_code}`);
  }
}

/**
 * Handle item webhooks
 * @param {Object} webhookEvent - The webhook event from Plaid
 * @returns {Promise<void>}
 */
async function handleItemWebhook(webhookEvent) {
  const { webhook_code, item_id } = webhookEvent;
  
  const { data: items, error: itemError } = await supabase
    .from('plaid_items')
    .select('user_id')
    .eq('item_id', item_id)
    .single();
  
  if (itemError || !items) {
    console.error('Error finding item:', itemError);
    return;
  }
  
  const { user_id } = items;
  
  switch (webhook_code) {
    case 'ERROR':
      await supabase
        .from('plaid_items')
        .update({ status: 'ERROR', error: webhookEvent.error })
        .eq('item_id', item_id);
      break;
    
    default:
      console.log(`Unhandled item webhook code: ${webhook_code}`);
  }
}

/**
 * Fetch and store transactions for a user
 * @param {string} userId - The user's ID
 * @param {string} accessToken - The access token for the user's financial institution
 * @returns {Promise<void>}
 */
async function fetchAndStoreTransactions(userId, accessToken) {
  try {
    // Get all recent transactions from Plaid
    const transactions = await getRecentTransactions(accessToken);
    
    console.log(`Retrieved ${transactions.length} transactions from Plaid for user ${userId}`);
    
    for (const transaction of transactions) {
      const { error } = await supabase
        .from('transactions')
        .upsert({
          user_id: userId,
          plaid_transaction_id: transaction.transaction_id,
          merchant_name: transaction.merchant_name || transaction.name,
          amount: transaction.amount,
          transaction_date: transaction.date,
          category: transaction.category ? transaction.category.join(', ') : null,
          raw_data: transaction // Store the full transaction data
        }, {
          onConflict: 'plaid_transaction_id'
        });
      
      if (error) {
        console.error('Error storing transaction:', error);
      }
    }
    
    const processedTransactions = await processTransactions(transactions);
    
    console.log(`Filtered ${processedTransactions.length} food-related transactions out of ${transactions.length} total`);
    
    // Create feed items from processed transactions
    await createFeedItems(userId, processedTransactions);
    
    console.log(`Completed processing transactions for user ${userId}`);
  } catch (error) {
    console.error('Error fetching and storing transactions:', error);
    throw error;
  }
}

/**
 * Handle removed transactions
 * @param {Object} webhookEvent - The webhook event from Plaid
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 */
async function handleRemovedTransactions(webhookEvent, userId) {
  const { removed_transactions } = webhookEvent;
  
  if (!removed_transactions || removed_transactions.length === 0) {
    return;
  }
  
  const { error } = await supabase
    .from('transactions')
    .delete()
    .in('plaid_transaction_id', removed_transactions)
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error removing transactions:', error);
  } else {
    console.log(`Removed ${removed_transactions.length} transactions for user ${userId}`);
  }
}

module.exports = {
  handleWebhook
};
