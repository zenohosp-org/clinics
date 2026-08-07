create table public.invoices (
  id uuid not null,
  created_at timestamp without time zone null,
  discount numeric(10, 2) not null,
  invoice_number character varying(255) not null,
  notes text null,
  status character varying(20) null,
  subtotal numeric(10, 2) not null,
  tax numeric(10, 2) not null,
  total numeric(10, 2) not null,
  updated_at timestamp without time zone null,
  appointment_id uuid null,
  hospital_id uuid not null,
  patient_id integer not null,
  specialization_id uuid null,
  payment_method character varying(50) null,
  admission_id uuid null,
  advance_adjusted numeric(10, 2) null,
  paid_amount numeric(10, 2) null,
  status_id integer null,
  version bigint null,
  constraint invoices_pkey primary key (id),
  constraint ukl1x55mfsay7co0r3m9ynvipd5 unique (invoice_number),
  constraint fkmfoy3ff0vyx8yrbrvysffoc40 foreign KEY (specialization_id) references specializations (id),
  constraint fkjnop5n9opkiidvnj59w7af8bb foreign KEY (admission_id) references admissions (id),
  constraint fkrpyotno5h237hyoaokuggqqog foreign KEY (patient_id) references patients (patient_id),
  constraint fkngg5bc8atao2b9jehl9l8tdsw foreign KEY (appointment_id) references appointments (id),
  constraint fkmdskyllmnmki7r5978dr7mdv5 foreign KEY (hospital_id) references hospitals (id)
) TABLESPACE pg_default;

create index IF not exists idx_invoices_hospital_id on public.invoices using btree (hospital_id) TABLESPACE pg_default;
create index IF not exists idx_invoices_patient_id on public.invoices using btree (patient_id) TABLESPACE pg_default;
create index IF not exists idx_invoices_admission_id on public.invoices using btree (admission_id) TABLESPACE pg_default;
create index IF not exists idx_invoices_status on public.invoices using btree (status) TABLESPACE pg_default;
create index IF not exists idx_invoices_created_at on public.invoices using btree (created_at desc) TABLESPACE pg_default;

create table public.invoice_statuses (
  id integer not null,
  code character varying(50) not null,
  constraint invoice_statuses_pkey primary key (id)
) TABLESPACE pg_default;

create table public.invoice_payments (
  id uuid not null,
  amount numeric(12, 2) not null,
  bank_account_id uuid null,
  collected_by character varying(100) null,
  notes character varying(255) null,
  paid_at timestamp without time zone null,
  payment_method character varying(30) null,
  invoice_id uuid not null,
  constraint invoice_payments_pkey primary key (id),
  constraint fkaa9if3io1iupfuqgsm0fbuch9 foreign KEY (invoice_id) references invoices (id)
) TABLESPACE pg_default;

create table public.invoice_items (
  id uuid not null,
  description character varying(255) not null,
  quantity integer not null,
  service_id uuid null,
  total_price numeric(10, 2) not null,
  unit_price numeric(10, 2) not null,
  invoice_id uuid not null,
  item_type character varying(30) null,
  radiology_order_id bigint null,
  appointment_id uuid null,
  waiver_amount numeric(10, 2) null,
  waiver_reason character varying(255) null,
  ambulance_booking_id bigint null,
  pharmacy_bill_id uuid null,
  ot_booking_id uuid null,
  ot_invoice_item_id uuid null,
  constraint invoice_items_pkey primary key (id),
  constraint fk46ae0lhu1oqs7cv91fn6y9n7w foreign KEY (invoice_id) references invoices (id)
) TABLESPACE pg_default;

create index IF not exists idx_invoice_items_pharmacy_bill_id on public.invoice_items using btree (pharmacy_bill_id) TABLESPACE pg_default;
