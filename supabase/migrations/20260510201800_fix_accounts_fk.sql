-- Fix: Add missing foreign key constraint on accounts.user_id
-- The original migration created accounts without REFERENCES auth.users(id)
ALTER TABLE public.accounts
ADD CONSTRAINT accounts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
