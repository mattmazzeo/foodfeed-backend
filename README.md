# FoodFeed Backend

This directory contains the backend components for the FoodFeed application.

## Supabase Setup

The backend uses Supabase for database, authentication, and row-level security. The schema is defined in `schema.sql` and includes the following tables:

- `users` - User profiles and authentication data
- `transactions` - Raw transaction data from Plaid
- `feed_items` - Processed feed entries with enriched data
- `reactions` - User reactions to feed items (likes, etc.)
- `comments` - User comments on feed items

## Row-Level Security

Row-level security is enabled on all tables with policies that ensure:

1. Users can only view their own profile data
2. Users can only view their own transactions
3. Users can view feed items from themselves and others (if not hidden)
4. Anyone can view reactions and comments
5. Users can only create/update/delete their own content

## Environment Configuration

The backend requires the following environment variables:

```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
```

These are stored in `config/.env` and should be kept secure.

## Data Flow

1. **Plaid Integration**: Connects to user payment accounts
2. **Webhook Handler**: Receives transaction notifications
3. **Transaction Filter**: Filters for food/drink transactions
4. **Enrichment Service**: Adds Google Places data
5. **Feed Generation**: Creates feed items for the mobile app

## Development

To set up the Supabase project:

1. Create a new project at [Supabase Dashboard](https://app.supabase.com)
2. Enable Row Level Security
3. Run the SQL commands in `schema.sql` to create tables and policies
4. Set up authentication with OAuth providers and magic links
5. Create Edge Functions for data processing (coming soon)
