-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id bigint NOT NULL DEFAULT nextval('admins_id_seq'::regclass),
  telegram_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{"can_post_channel": true, "can_review_orders": true, "can_manage_reviews": true, "can_view_analytics": true}'::jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT admins_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_settings (
  id integer NOT NULL DEFAULT nextval('app_settings_id_seq'::regclass),
  key character varying NOT NULL UNIQUE,
  value jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_by integer,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.auth_tokens (
  id bigint NOT NULL DEFAULT nextval('auth_tokens_id_seq'::regclass),
  refresh_token text NOT NULL UNIQUE,
  expires_at timestamp without time zone NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  user_id bigint NOT NULL,
  CONSTRAINT auth_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.bot_greeted_users (
  id integer NOT NULL DEFAULT nextval('bot_greeted_users_id_seq'::regclass),
  platform character varying NOT NULL,
  user_identifier character varying NOT NULL,
  community_id character varying NOT NULL,
  greeting_type character varying NOT NULL DEFAULT 'message',
  greeted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bot_greeted_users_pkey PRIMARY KEY (id),
  CONSTRAINT bot_greeted_users_unique UNIQUE (platform, user_identifier, community_id, greeting_type)
);
CREATE TABLE public.catalogs (
  id integer NOT NULL DEFAULT nextval('catalogs_id_seq'::regclass),
  title character varying NOT NULL,
  genre USER-DEFINED NOT NULL,
  product_ids text NOT NULL DEFAULT ''::text,
  description text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  slug character varying UNIQUE,
  sort_order integer DEFAULT 0,
  CONSTRAINT catalogs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.certificate_templates (
  id integer NOT NULL DEFAULT nextval('certificate_templates_id_seq'::regclass),
  image_url text NOT NULL,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT certificate_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.certificates (
  id integer NOT NULL DEFAULT nextval('certificates_id_seq'::regclass),
  certificate_code text NOT NULL UNIQUE,
  template_id integer,
  recipient_name text NOT NULL,
  amount numeric NOT NULL,
  purchase_order_id integer,
  purchaser_user_id integer,
  delivery_type text CHECK (delivery_type = ANY (ARRAY['pdf'::text, 'physical'::text, 'code'::text])),
  cert_image_url text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'delivered'::text, 'redeemed'::text])),
  redeemed_at timestamp with time zone,
  redeemed_by_user_id integer,
  redeemed_in_order_id integer,
  created_at timestamp with time zone DEFAULT now(),
  paid_at timestamp with time zone,
  min_cart_amount numeric DEFAULT 0,
  CONSTRAINT certificates_pkey PRIMARY KEY (id),
  CONSTRAINT certificates_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.certificate_templates(id),
  CONSTRAINT certificates_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.orders(id),
  CONSTRAINT certificates_purchaser_user_id_fkey FOREIGN KEY (purchaser_user_id) REFERENCES public.users(id),
  CONSTRAINT certificates_redeemed_by_user_id_fkey FOREIGN KEY (redeemed_by_user_id) REFERENCES public.users(id),
  CONSTRAINT certificates_redeemed_in_order_id_fkey FOREIGN KEY (redeemed_in_order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.custom_uploads (
  id integer NOT NULL DEFAULT nextval('custom_uploads_id_seq'::regclass),
  user_id bigint,
  image_url text NOT NULL,
  product_id integer,
  storage_provider character varying,
  file_key character varying,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT custom_uploads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.delivery_estimates (
  id integer NOT NULL DEFAULT nextval('delivery_estimates_id_seq'::regclass),
  postal_code character varying NOT NULL,
  postal_prefix character varying NOT NULL,
  city character varying,
  region character varying,
  weight_grams integer NOT NULL,
  delivery_type character varying NOT NULL,
  service_code character varying,
  provider_price numeric,
  packaging_cost numeric DEFAULT 0,
  total_price numeric NOT NULL,
  source character varying NOT NULL,
  estimated_days_min integer,
  estimated_days_max integer,
  created_at timestamp without time zone DEFAULT now(),
  order_id bigint,
  CONSTRAINT delivery_estimates_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_estimates_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.faq_categories (
  id integer NOT NULL DEFAULT nextval('faq_categories_id_seq'::regclass),
  title text NOT NULL,
  icon text,
  sort_order integer DEFAULT 999,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT faq_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.faq_items (
  id integer NOT NULL DEFAULT nextval('faq_items_id_seq'::regclass),
  category_id integer NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer DEFAULT 999,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  image_url text,
  show_on_pages text[],
  CONSTRAINT faq_items_pkey PRIMARY KEY (id),
  CONSTRAINT faq_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.faq_categories(id)
);
CREATE TABLE public.giveaway_participants (
  giveaway_id uuid NOT NULL,
  user_id bigint NOT NULL,
  username text,
  first_name text,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT giveaway_participants_pkey PRIMARY KEY (giveaway_id, user_id),
  CONSTRAINT giveaway_participants_giveaway_id_fkey FOREIGN KEY (giveaway_id) REFERENCES public.giveaways(id)
);
CREATE TABLE public.giveaways (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  prizes text,
  winner_count integer NOT NULL DEFAULT 1,
  channel_ids ARRAY NOT NULL,
  end_time timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  message_ids jsonb,
  winner_user_ids ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT giveaways_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inline_search_feedback (
  id integer NOT NULL DEFAULT nextval('inline_search_feedback_id_seq'::regclass),
  result_id text NOT NULL,
  product_id integer,
  query text NOT NULL,
  user_id bigint,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inline_search_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT inline_search_feedback_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.inline_search_log (
  id integer NOT NULL DEFAULT nextval('inline_search_log_id_seq'::regclass),
  query text NOT NULL,
  results_count integer NOT NULL DEFAULT 0,
  user_id bigint,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inline_search_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ip_rights_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  search_term text NOT NULL,
  checked_at timestamp with time zone DEFAULT now(),
  fips_url text,
  holder_name text,
  trademark_name text,
  goods_classes ARRAY,
  status text DEFAULT 'pending'::text,
  dismissed_at timestamp with time zone,
  dismissed_by text,
  notes text,
  CONSTRAINT ip_rights_checks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ip_rights_false_positives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  search_term text NOT NULL,
  trademark_name text NOT NULL,
  holder_name text,
  dismissed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ip_rights_false_positives_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ip_rights_manual (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ip_name text NOT NULL UNIQUE,
  holder_name text NOT NULL,
  source_url text,
  notes text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ip_rights_manual_pkey PRIMARY KEY (id)
);
CREATE TABLE public.moderation_words (
  id integer NOT NULL DEFAULT nextval('moderation_words_id_seq'::regclass),
  word character varying NOT NULL,
  category character varying NOT NULL DEFAULT 'general'::character varying,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT moderation_words_pkey PRIMARY KEY (id)
);
CREATE TABLE public.order_addresses (
  id bigint NOT NULL DEFAULT nextval('order_addresses_id_seq'::regclass),
  order_id bigint NOT NULL UNIQUE,
  surname text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  postal_index text NOT NULL,
  address text NOT NULL,
  comment text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  anonymous_present boolean DEFAULT false,
  recipient_contact text,
  actual_delivery_info text,
  pvz_code text,
  pvz_address text,
  CONSTRAINT order_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT order_addresses_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.shared_wishlists (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.users(id),
  share_token varchar(32) NOT NULL UNIQUE,
  product_ids jsonb NOT NULL,
  tags jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days')
);
CREATE INDEX idx_shared_wishlists_token ON public.shared_wishlists(share_token);
CREATE TABLE public.order_edit_history (
  id integer NOT NULL DEFAULT nextval('order_edit_history_id_seq'::regclass),
  order_id bigint NOT NULL,
  edited_by character varying NOT NULL,
  editor_user_id bigint,
  edit_type character varying NOT NULL,
  edit_details jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT order_edit_history_pkey PRIMARY KEY (id),
  CONSTRAINT order_edit_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_edit_history_editor_user_id_fkey FOREIGN KEY (editor_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.order_items (
  id bigint NOT NULL DEFAULT nextval('order_items_id_seq'::regclass),
  order_id bigint NOT NULL,
  product_id integer,
  title text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  property text,
  variation_num text,
  image text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  price_at_purchase numeric NOT NULL,
  certificate_id integer,
  admin_added boolean DEFAULT false,
  admin_modified boolean DEFAULT false,
  deleted_by_admin boolean DEFAULT false,
  custom_url text,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.order_parcel_items (
  id integer NOT NULL DEFAULT nextval('order_parcel_items_id_seq'::regclass),
  parcel_id integer NOT NULL,
  order_item_id bigint NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  CONSTRAINT order_parcel_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_parcel_items_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.order_parcels(id),
  CONSTRAINT order_parcel_items_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id)
);
CREATE TABLE public.order_parcels (
  id integer NOT NULL DEFAULT nextval('order_parcels_id_seq'::regclass),
  order_id bigint NOT NULL,
  parcel_number integer NOT NULL DEFAULT 1,
  packaging_type character varying NOT NULL,
  total_weight_grams integer NOT NULL,
  packaging_cost numeric NOT NULL,
  length_cm integer,
  width_cm integer,
  height_cm integer,
  provider_id integer,
  service_id integer,
  shipping_cost numeric,
  estimated_min_days integer,
  estimated_max_days integer,
  provider_shipment_id character varying,
  tracking_number character varying,
  label_url text,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'created'::character varying, 'shipped'::character varying, 'delivered'::character varying, 'returned'::character varying]::text[])),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  approved_at timestamp without time zone,
  shipped_at timestamp without time zone,
  delivered_at timestamp without time zone,
  CONSTRAINT order_parcels_pkey PRIMARY KEY (id),
  CONSTRAINT order_parcels_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_parcels_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.shipping_providers(id),
  CONSTRAINT order_parcels_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.shipping_services(id)
);
CREATE TABLE public.order_status_history (
  id bigint NOT NULL DEFAULT nextval('order_status_history_id_seq'::regclass),
  order_id bigint NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT order_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);
CREATE TABLE public.orders (
  id bigint NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
  status text NOT NULL DEFAULT 'new'::text CHECK (status = ANY (ARRAY['awaiting_calculation'::text, 'awaiting_payment'::text, 'paid'::text, 'awaiting_certificate'::text, 'shipped'::text, 'delivered'::text, 'on_hold'::text, 'refund_requested'::text, 'refunded'::text, 'cancelled'::text, 'created'::text, 'confirmed'::text, 'new'::text, 'evaluation'::text, 'reviewed'::text, 'accepted'::text, 'in_work'::text, 'parcel_pending'::text, 'parcel_ready'::text, 'suggested'::text])),
  payment_id text,
  tracking_number text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  delivery_type character varying DEFAULT 'pochta'::character varying CHECK (delivery_type::text = ANY (ARRAY['pochta'::text, 'pochta_standard'::text, 'pochta_courier'::text, 'pochta_first_class'::text, 'courier_ems'::text, 'international'::text, 'cdek_pvz'::text, 'cdek_courier'::text, 'pickup'::text, 'pdf'::text])),
  delivery_type_note text,
  user_id bigint NOT NULL,
  total_price numeric NOT NULL,
  delivery_cost numeric NOT NULL DEFAULT 0,
  is_deleted boolean DEFAULT false,
  deleted_at timestamp without time zone,
  processed boolean DEFAULT false,
  processed_at timestamp without time zone,
  country character varying,
  shipment_date date,
  delivery_timeframe text,
  delivery_notes text,
  express_delivery boolean DEFAULT false,
  cancellation_reason text,
  address_edited boolean DEFAULT false,
  notion_synced boolean DEFAULT false,
  urgent boolean DEFAULT false,
  custom_product_approved boolean,
  receipt_id text,
  receipt_url text,
  receipt_cancelled boolean DEFAULT false,
  receipt_generated_at timestamp without time zone,
  receipt_cancelled_at timestamp without time zone,
  refund_reason text,
  payment_provider character varying DEFAULT 'yookassa'::character varying,
  shipping_provider_id integer,
  shipping_service_id integer,
  packaging_cost numeric DEFAULT 0,
  estimated_min_days integer,
  estimated_max_days integer,
  delivered_at timestamp without time zone,
  user_confirmed_delivery boolean DEFAULT false,
  batch_status character varying DEFAULT NULL::character varying,
  estimated_delivery_min date,
  estimated_delivery_max date,
  last_tracking_status character varying,
  last_tracking_update timestamp without time zone,
  tracking_history jsonb DEFAULT '[]'::jsonb,
  promo_code_id integer,
  discount_amount numeric DEFAULT 0,
  arrived_at_point_at timestamp without time zone,
  storage_deadline timestamp without time zone,
  returned_to_sender_at timestamp without time zone,
  return_action character varying,
  return_action_requested_at timestamp without time zone,
  last_storage_notification_at timestamp without time zone,
  arrival_notified boolean DEFAULT false,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT orders_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id)
);
CREATE TABLE public.packaging_config (
  id integer NOT NULL DEFAULT nextval('packaging_config_id_seq'::regclass),
  code character varying NOT NULL UNIQUE,
  display_name character varying NOT NULL,
  cost numeric NOT NULL,
  weight_grams integer NOT NULL,
  max_frameless_format character varying,
  is_carton boolean DEFAULT false,
  carton_size character varying,
  is_active boolean DEFAULT true,
  dimensions_length_cm integer,
  dimensions_width_cm integer,
  dimensions_height_cm integer,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT packaging_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payment_transactions (
  id integer NOT NULL DEFAULT nextval('payment_transactions_id_seq'::regclass),
  order_id bigint NOT NULL,
  provider character varying NOT NULL,
  transaction_id character varying,
  amount numeric NOT NULL,
  currency character varying DEFAULT 'RUB'::character varying,
  status character varying NOT NULL,
  provider_response jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.product_images (
  id integer NOT NULL DEFAULT nextval('product_images_id_seq'::regclass),
  product_id integer NOT NULL,
  url text NOT NULL,
  extra USER-DEFINED,
  sort_order integer,
  mix boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  hidden_product boolean NOT NULL DEFAULT false,
  CONSTRAINT product_images_pkey PRIMARY KEY (id),
  CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_images_2 (
  id integer NOT NULL DEFAULT nextval('product_images_2_id_seq'::regclass),
  product_id integer NOT NULL,
  url text NOT NULL,
  extra USER-DEFINED,
  sort_order integer,
  deprecated boolean NOT NULL DEFAULT false,
  CONSTRAINT product_images_2_pkey PRIMARY KEY (id),
  CONSTRAINT fk_product_images_2_product FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_image_refs (
  id integer NOT NULL DEFAULT nextval('product_image_refs_id_seq'::regclass),
  product_id integer NOT NULL,
  image_id integer NOT NULL,
  sort_order integer DEFAULT 0,
  CONSTRAINT product_image_refs_pkey PRIMARY KEY (id),
  CONSTRAINT product_image_refs_unique UNIQUE (product_id, image_id),
  CONSTRAINT product_image_refs_product_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  CONSTRAINT product_image_refs_image_fkey FOREIGN KEY (image_id) REFERENCES public.product_images_2(id) ON DELETE CASCADE
);
CREATE TABLE public.product_link_groups (
  id integer NOT NULL DEFAULT nextval('product_link_groups_id_seq'::regclass),
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_link_groups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_link_items (
  id integer NOT NULL DEFAULT nextval('product_link_items_id_seq'::regclass),
  group_id integer NOT NULL,
  product_id integer NOT NULL UNIQUE,
  sort_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  variant_name character varying DEFAULT NULL::character varying,
  variant_excluded boolean DEFAULT false,
  CONSTRAINT product_link_items_pkey PRIMARY KEY (id),
  CONSTRAINT product_link_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_link_groups(id),
  CONSTRAINT product_link_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_prices (
  id integer NOT NULL DEFAULT nextval('product_prices_id_seq'::regclass),
  format character varying NOT NULL,
  frame_type USER-DEFINED NOT NULL,
  discount_price numeric NOT NULL,
  base_price numeric NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  weight_grams integer,
  CONSTRAINT product_prices_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_release_notifications (
  id bigint NOT NULL DEFAULT nextval('product_release_notifications_id_seq'::regclass),
  user_id bigint NOT NULL,
  product_id integer NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_release_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT product_release_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT product_release_notifications_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_type_links (
  id integer NOT NULL DEFAULT nextval('product_type_links_id_seq'::regclass),
  firm_product_id integer NOT NULL UNIQUE,
  orig_product_id integer NOT NULL UNIQUE,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT product_type_links_pkey PRIMARY KEY (id),
  CONSTRAINT product_type_links_firm_product_id_fkey FOREIGN KEY (firm_product_id) REFERENCES public.products(id),
  CONSTRAINT product_type_links_orig_product_id_fkey FOREIGN KEY (orig_product_id) REFERENCES public.products(id)
);
CREATE TABLE public.products (
  id integer NOT NULL DEFAULT nextval('products_id_seq'::regclass),
  title character varying NOT NULL,
  genre USER-DEFINED,
  key_word text,
  type USER-DEFINED,
  discount boolean DEFAULT false,
  description text,
  release_date date,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  triptych boolean DEFAULT false,
  sort_order integer DEFAULT 999,
  alt text,
  price numeric,
  old_price numeric,
  base_single_price numeric,
  base_single_old_price numeric,
  status character varying NOT NULL DEFAULT 'available'::character varying CHECK (status::text = ANY (ARRAY['available'::text, 'coming_soon'::text, 'not_for_sale'::text, 'test'::text, 'available_via_var'::text, 'custom'::text])),
  catalog_ids jsonb DEFAULT '[]'::jsonb,
  slug character varying UNIQUE,
  editing boolean,
  development_time integer,
  hide_development_time boolean NOT NULL DEFAULT false,
  quality character varying CHECK (quality::text = ANY (ARRAY['best'::text, 'good'::text, 'medium'::text])),
  author character varying,
  is_manual_sort boolean DEFAULT true,
  ip_names text,
  restored boolean NOT NULL DEFAULT false,
  vk_market_url text,
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promo_codes (
  id integer NOT NULL DEFAULT nextval('promo_codes_id_seq'::regclass),
  code character varying NOT NULL UNIQUE,
  type character varying NOT NULL DEFAULT 'fixed'::character varying CHECK (type::text = ANY (ARRAY['fixed'::character varying, 'percent'::character varying]::text[])),
  value numeric NOT NULL,
  min_order_amount numeric DEFAULT 0,
  max_uses integer,
  uses_count integer DEFAULT 0,
  valid_from timestamp without time zone,
  valid_until timestamp without time zone,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT promo_codes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.service_daily_stats (
  service text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  counter text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  CONSTRAINT service_daily_stats_pkey PRIMARY KEY (service, date, counter)
);
CREATE TABLE public.shipment_settings (
  id integer NOT NULL DEFAULT nextval('shipment_settings_id_seq'::regclass),
  next_shipment_date date NOT NULL,
  updated_at timestamp without time zone DEFAULT now(),
  updated_by bigint,
  next_shipment_date_end date,
  CONSTRAINT shipment_settings_pkey PRIMARY KEY (id),
  CONSTRAINT shipment_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);
CREATE TABLE public.shipping_providers (
  id integer NOT NULL DEFAULT nextval('shipping_providers_id_seq'::regclass),
  code character varying NOT NULL UNIQUE,
  display_name character varying NOT NULL,
  is_active boolean DEFAULT true,
  credentials jsonb,
  sender_info jsonb,
  settings jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shipping_providers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shipping_services (
  id integer NOT NULL DEFAULT nextval('shipping_services_id_seq'::regclass),
  provider_id integer NOT NULL,
  code character varying NOT NULL,
  internal_code character varying,
  display_name character varying NOT NULL,
  description text,
  is_visible boolean DEFAULT true,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 100,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shipping_services_pkey PRIMARY KEY (id),
  CONSTRAINT shipping_services_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.shipping_providers(id)
);
CREATE TABLE public.stories (
  id integer NOT NULL DEFAULT nextval('stories_id_seq'::regclass),
  title text,
  image_url text NOT NULL,
  link_url text,
  link_text text,
  duration integer NOT NULL DEFAULT 5000,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT stories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_cart (
  id bigint NOT NULL DEFAULT nextval('user_cart_id_seq'::regclass),
  product_id integer NOT NULL,
  property text NOT NULL,
  quantity integer DEFAULT 1 CHECK (quantity > 0),
  variation_num text,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  checked boolean DEFAULT true,
  user_id bigint NOT NULL,
  CONSTRAINT user_cart_pkey PRIMARY KEY (id),
  CONSTRAINT user_cart_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_favorites (
  id bigint NOT NULL DEFAULT nextval('user_favorites_id_seq'::regclass),
  product_id integer NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  user_id bigint NOT NULL,
  tag character varying,
  CONSTRAINT user_favorites_pkey PRIMARY KEY (id),
  CONSTRAINT user_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_feedback (
  id bigint NOT NULL DEFAULT nextval('user_feedback_id_seq'::regclass),
  user_id bigint NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['review'::character varying, 'comment'::character varying, 'suggestion'::character varying]::text[])),
  product_id integer,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  text text NOT NULL,
  verified_purchase boolean DEFAULT false,
  is_deleted boolean DEFAULT false,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  is_read boolean DEFAULT false,
  is_hidden boolean DEFAULT false,
  order_id integer,
  CONSTRAINT user_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT user_feedback_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT user_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_feedback_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);
CREATE TABLE public.user_feedback_likes (
  user_id bigint NOT NULL,
  feedback_id bigint NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_feedback_likes_pkey PRIMARY KEY (user_id, feedback_id),
  CONSTRAINT user_feedback_likes_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id),
  CONSTRAINT user_feedback_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_feedback_responses (
  id bigint NOT NULL DEFAULT nextval('user_feedback_responses_id_seq'::regclass),
  feedback_id bigint NOT NULL,
  response_text text NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_feedback_responses_pkey PRIMARY KEY (id),
  CONSTRAINT user_feedback_responses_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id)
);
CREATE TABLE public.user_picker_progress (
  id bigint NOT NULL DEFAULT nextval('user_picker_progress_id_seq'::regclass),
  products jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_index integer DEFAULT 0,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  user_id bigint NOT NULL UNIQUE,
  CONSTRAINT user_picker_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_picker_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id bigint NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  telegram_id bigint UNIQUE,
  yandex_id text UNIQUE,
  username text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  email text UNIQUE,
  photo_url text,
  is_premium boolean DEFAULT false,
  login_method character varying DEFAULT 'telegram'::character varying,
  notification_method text DEFAULT 'telegram'::text CHECK (notification_method = ANY (ARRAY['telegram'::text, 'email'::text, 'both'::text, 'vk'::text, 'max'::text])),
  is_deleted boolean DEFAULT false,
  deleted_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  last_login timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  hide_photo boolean DEFAULT false,
  payment_email character varying,
  vk_id text UNIQUE,
  screen_name text,
  notifications_enabled boolean DEFAULT true,
  max_id text UNIQUE,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- ============ INDEXES ============

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_auth_tokens_user_id ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_expires_at ON auth_tokens(expires_at);
CREATE INDEX idx_user_cart_user_id ON user_cart(user_id);
CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX idx_user_feedback_product_id ON user_feedback(product_id) WHERE NOT is_deleted;
CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_inline_search_log_created_at ON inline_search_log(created_at);
