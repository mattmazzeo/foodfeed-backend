CREATE TABLE IF NOT EXISTS public.feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) NOT NULL,
  transaction_id TEXT REFERENCES public.transactions(plaid_transaction_id) NOT NULL,
  merchant_name TEXT NOT NULL,
  amount NUMERIC,
  transaction_date DATE NOT NULL,
  place_id TEXT,
  place_name TEXT,
  place_address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  photo_url TEXT,
  is_visible BOOLEAN DEFAULT TRUE,
  show_amount BOOLEAN DEFAULT FALSE,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own feed items" ON public.feed_items
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.follows
      WHERE follower_id = auth.uid() AND following_id = user_id
    )
  );

CREATE POLICY "Users can insert their own feed items" ON public.feed_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feed items" ON public.feed_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feed items" ON public.feed_items
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feed_items_user_id ON public.feed_items(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_transaction_id ON public.feed_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_transaction_date ON public.feed_items(transaction_date);
CREATE INDEX IF NOT EXISTS idx_feed_items_is_visible ON public.feed_items(is_visible);
