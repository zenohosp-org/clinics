ALTER TABLE public.invoice_payments ADD COLUMN collected_by_id uuid REFERENCES public.users(id);
ALTER TABLE public.invoices ADD COLUMN updated_by_id uuid REFERENCES public.users(id);
