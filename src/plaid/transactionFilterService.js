const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config({ path: './config/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const FOOD_MCC_CODES = [
  '5811', // Caterers
  '5812', // Eating Places, Restaurants
  '5813', // Drinking Places (Alcoholic Beverages), Bars, Taverns, Nightclubs, Lounges, Discos
  '5814', // Fast Food Restaurants
  '5499', // Convenience Stores and Specialty Markets
  '5441', // Candy, Nut, and Confectionery Stores
  '5462', // Bakeries
  '5310', // Discount Stores
  '5411', // Grocery Stores, Supermarkets
  '5422', // Freezer and Locker Meat Provisioners
  '5451', // Dairy Products Stores
  '5309', // Duty Free Stores
];

const FOOD_KEYWORDS = [
  'restaurant', 'cafe', 'coffee', 'bakery', 'diner', 'eatery', 'grill', 'pizzeria',
  'bistro', 'steakhouse', 'sushi', 'taco', 'burger', 'sandwich', 'food', 'kitchen',
  'bar', 'pub', 'tavern', 'brewery', 'winery', 'distillery', 'cocktail',
  'grocery', 'market', 'supermarket', 'deli', 'convenience', 'liquor', 'wine', 'beer',
  'donut', 'bagel', 'pastry', 'dessert', 'ice cream', 'yogurt', 'smoothie', 'juice',
  'bbq', 'barbecue', 'seafood', 'thai', 'chinese', 'italian', 'mexican', 'indian',
  'fast food', 'takeout', 'delivery', 'catering'
];

const MERCHANT_WHITELIST = [
  'starbucks', 'mcdonald', 'subway', 'chipotle', 'dunkin', 'panera', 'taco bell',
  'burger king', 'wendy', 'domino', 'pizza hut', 'kfc', 'chick-fil-a', 'popeyes',
  'shake shack', 'five guys', 'in-n-out', 'whataburger', 'dairy queen', 'sonic',
  'panda express', 'chili', 'applebee', 'olive garden', 'outback', 'red lobster',
  'cheesecake factory', 'ihop', 'denny', 'waffle house', 'cracker barrel',
  'whole foods', 'trader joe', 'kroger', 'publix', 'safeway', 'albertsons',
  'costco', 'walmart', 'target', '7-eleven', 'wawa', 'sheetz', 'quicktrip',
  'blue bottle', 'philz', 'peet', 'tim horton', 'jamba juice', 'smoothie king',
  'sweetgreen', 'just salad', 'dig inn', 'cava', 'tender greens'
];

/**
 * Filter transactions to identify food-related transactions
 * @param {Array} transactions - Array of Plaid transactions
 * @returns {Promise<Array>} - Array of filtered food-related transactions
 */
async function filterFoodTransactions(transactions) {
  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const foodTransactions = transactions.filter(transaction => {
    if (transaction.pending) {
      return false;
    }

    if (transaction.merchant_category_code && 
        FOOD_MCC_CODES.includes(transaction.merchant_category_code)) {
      return true;
    }

    if (transaction.category && Array.isArray(transaction.category)) {
      const categories = transaction.category.map(cat => cat.toLowerCase());
      if (categories.includes('food and drink') || 
          categories.includes('restaurants') || 
          categories.includes('coffee shop') ||
          categories.includes('groceries') ||
          categories.includes('alcohol and bars')) {
        return true;
      }
    }

    const merchantName = (transaction.merchant_name || transaction.name || '').toLowerCase();
    if (MERCHANT_WHITELIST.some(merchant => merchantName.includes(merchant.toLowerCase()))) {
      return true;
    }

    if (FOOD_KEYWORDS.some(keyword => merchantName.includes(keyword.toLowerCase()))) {
      return true;
    }

    return false;
  });

  return foodTransactions;
}

/**
 * Enrich transaction with Google Places data
 * @param {Object} transaction - Plaid transaction object
 * @returns {Promise<Object>} - Enriched transaction with place data
 */
async function enrichTransactionWithPlaceData(transaction) {
  try {
    const merchantName = transaction.merchant_name || transaction.name;
    if (!merchantName) {
      return transaction;
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', {
      params: {
        input: merchantName,
        inputtype: 'textquery',
        fields: 'place_id,name,formatted_address,geometry,photos',
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status !== 'OK' || !response.data.candidates || response.data.candidates.length === 0) {
      return transaction;
    }

    const place = response.data.candidates[0];
    
    let photoUrl = null;
    if (place.photos && place.photos.length > 0) {
      photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    }

    return {
      ...transaction,
      place_data: {
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        latitude: place.geometry?.location?.lat,
        longitude: place.geometry?.location?.lng,
        photo_url: photoUrl
      }
    };
  } catch (error) {
    console.error('Error enriching transaction with place data:', error);
    return transaction;
  }
}

/**
 * Process transactions: filter food transactions and enrich with place data
 * @param {Array} transactions - Array of Plaid transactions
 * @returns {Promise<Array>} - Array of processed food transactions
 */
async function processTransactions(transactions) {
  try {
    const foodTransactions = await filterFoodTransactions(transactions);
    
    const enrichedTransactions = await Promise.all(
      foodTransactions.map(transaction => enrichTransactionWithPlaceData(transaction))
    );
    
    return enrichedTransactions;
  } catch (error) {
    console.error('Error processing transactions:', error);
    throw error;
  }
}

/**
 * Create feed items from processed transactions
 * @param {string} userId - User ID
 * @param {Array} processedTransactions - Array of processed food transactions
 * @returns {Promise<void>}
 */
async function createFeedItems(userId, processedTransactions) {
  try {
    for (const transaction of processedTransactions) {
      const { data: existingItems, error: queryError } = await supabase
        .from('feed_items')
        .select('id')
        .eq('transaction_id', transaction.transaction_id)
        .single();
      
      if (queryError && queryError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error checking for existing feed item:', queryError);
        continue;
      }
      
      if (existingItems) {
        continue;
      }
      
      const { error: insertError } = await supabase
        .from('feed_items')
        .insert({
          user_id: userId,
          transaction_id: transaction.transaction_id,
          merchant_name: transaction.merchant_name || transaction.name,
          amount: transaction.amount,
          transaction_date: transaction.date,
          place_id: transaction.place_data?.place_id,
          place_name: transaction.place_data?.name,
          place_address: transaction.place_data?.address,
          latitude: transaction.place_data?.latitude,
          longitude: transaction.place_data?.longitude,
          photo_url: transaction.place_data?.photo_url,
          is_visible: true,
          show_amount: false // Default to not showing amount for privacy
        });
      
      if (insertError) {
        console.error('Error creating feed item:', insertError);
      }
    }
    
    console.log(`Created feed items for ${processedTransactions.length} transactions`);
  } catch (error) {
    console.error('Error creating feed items:', error);
    throw error;
  }
}

module.exports = {
  filterFoodTransactions,
  enrichTransactionWithPlaceData,
  processTransactions,
  createFeedItems
};
