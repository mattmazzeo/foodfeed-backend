const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const dotenv = require('dotenv');

dotenv.config({ path: './config/.env' });

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

/**
 * Create a link token for initializing Plaid Link
 * @param {string} userId - The user's ID in your system
 * @returns {Promise<string>} - The link token
 */
async function createLinkToken(userId) {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'FoodFeed',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });
    
    return response.data.link_token;
  } catch (error) {
    console.error('Error creating link token:', error);
    throw error;
  }
}

/**
 * Exchange a public token for an access token
 * @param {string} publicToken - The public token from Plaid Link
 * @returns {Promise<string>} - The access token
 */
async function exchangePublicToken(publicToken) {
  try {
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });
    
    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    };
  } catch (error) {
    console.error('Error exchanging public token:', error);
    throw error;
  }
}

/**
 * Fetch transactions for a user
 * @param {string} accessToken - The access token for the user's financial institution
 * @param {Date} startDate - The start date for transactions (YYYY-MM-DD)
 * @param {Date} endDate - The end date for transactions (YYYY-MM-DD)
 * @returns {Promise<Array>} - The transactions
 */
async function getTransactions(accessToken, startDate, endDate) {
  try {
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];
    
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: formattedStartDate,
      end_date: formattedEndDate,
      options: {
        count: 250,
        offset: 0,
      },
    });
    
    return response.data.transactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

/**
 * Get transactions from the last 90 days
 * @param {string} accessToken - The access token for the user's financial institution
 * @returns {Promise<Array>} - The transactions
 */
async function getRecentTransactions(accessToken) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90); // 90 days ago
  
  return getTransactions(accessToken, startDate, endDate);
}

module.exports = {
  createLinkToken,
  exchangePublicToken,
  getTransactions,
  getRecentTransactions,
};
