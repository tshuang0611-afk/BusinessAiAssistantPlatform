-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

-- DROP SEQUENCE assets_log_id_seq;

CREATE SEQUENCE assets_log_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.assets_log definition

-- Drop table

-- DROP TABLE assets_log;

CREATE TABLE assets_log (
	id serial4 NOT NULL,
	asset_id varchar(100) NOT NULL,
	is_passed bool DEFAULT false NULL,
	reason text NULL,
	generated_content text NULL,
	video_prompt text NULL,
	is_archived bool DEFAULT false NULL,
	created_at timestamptz DEFAULT now() NULL,
	ai_metadata jsonb NULL,
	ai_tags jsonb NULL,
	ai_analysis text NULL,
	asset_type varchar(50) NULL,
	ai_score int4 NULL,
	status varchar(20) DEFAULT 'PENDING'::character varying NULL,
	CONSTRAINT assets_log_asset_id_key UNIQUE (asset_id),
	CONSTRAINT assets_log_pkey PRIMARY KEY (id)
);


-- public.enterprises definition

-- Drop table

-- DROP TABLE enterprises;

CREATE TABLE enterprises (
	enterprise_id uuid DEFAULT gen_random_uuid() NOT NULL,
	tax_id varchar(10) NOT NULL,
	company_name varchar(255) NOT NULL,
	vip_level int4 DEFAULT 1 NULL,
	security_score numeric(5, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	enterprise_points numeric(15, 2) DEFAULT 1000.00 NULL,
	CONSTRAINT enterprises_pkey PRIMARY KEY (enterprise_id),
	CONSTRAINT enterprises_tax_id_key UNIQUE (tax_id)
);


-- public.wallets definition

-- Drop table

-- DROP TABLE wallets;

CREATE TABLE wallets (
	wallet_id uuid DEFAULT gen_random_uuid() NOT NULL,
	owner_id uuid NOT NULL,
	owner_type varchar(20) NOT NULL,
	balance numeric(15, 2) DEFAULT 0.00 NULL,
	currency varchar(10) DEFAULT 'POINTS'::character varying NULL,
	updated_at timestamptz DEFAULT now() NULL,
	CONSTRAINT unique_owner_wallet UNIQUE (owner_id),
	CONSTRAINT wallets_pkey PRIMARY KEY (wallet_id)
);


-- public.assets definition

-- Drop table

-- DROP TABLE assets;

CREATE TABLE assets (
	asset_id uuid DEFAULT gen_random_uuid() NOT NULL,
	owner_enterprise_id uuid NULL,
	asset_type varchar(20) NOT NULL,
	title varchar(255) NOT NULL,
	content_url text NULL,
	required_points numeric(15, 2) NULL,
	contribution_pts_reward numeric(15, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	ai_metadata jsonb NULL,
	CONSTRAINT assets_pkey PRIMARY KEY (asset_id),
	CONSTRAINT assets_owner_enterprise_id_fkey FOREIGN KEY (owner_enterprise_id) REFERENCES enterprises(enterprise_id) ON DELETE CASCADE
);


-- public.contribution_log definition

-- Drop table

-- DROP TABLE contribution_log;

CREATE TABLE contribution_log (
	contribution_id uuid DEFAULT gen_random_uuid() NOT NULL,
	enterprise_id uuid NULL,
	asset_id uuid NULL,
	contribution_type varchar(50) NULL,
	reward_points numeric(15, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT contribution_log_pkey PRIMARY KEY (contribution_id),
	CONSTRAINT contribution_log_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
	CONSTRAINT contribution_log_enterprise_id_fkey FOREIGN KEY (enterprise_id) REFERENCES enterprises(enterprise_id)
);


-- public.users definition

-- Drop table

-- DROP TABLE users;

CREATE TABLE users (
	user_id uuid DEFAULT gen_random_uuid() NOT NULL,
	enterprise_id uuid NULL,
	phone_number varchar(20) NOT NULL,
	user_role varchar(50) DEFAULT 'USER'::character varying NULL,
	wallet_points numeric(15, 2) DEFAULT 0.00 NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT users_phone_number_key UNIQUE (phone_number),
	CONSTRAINT users_pkey PRIMARY KEY (user_id),
	CONSTRAINT users_enterprise_id_fkey FOREIGN KEY (enterprise_id) REFERENCES enterprises(enterprise_id) ON DELETE CASCADE
);


-- public.wallet_transactions definition

-- Drop table

-- DROP TABLE wallet_transactions;

CREATE TABLE wallet_transactions (
	transaction_id uuid DEFAULT gen_random_uuid() NOT NULL,
	from_wallet_id uuid NULL,
	to_wallet_id uuid NULL,
	amount numeric(15, 2) NOT NULL,
	fee_amount numeric(15, 2) DEFAULT 0.00 NULL,
	transaction_type varchar(50) NOT NULL,
	related_asset_id uuid NULL,
	description text NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT wallet_transactions_pkey PRIMARY KEY (transaction_id),
	CONSTRAINT wallet_transactions_from_wallet_id_fkey FOREIGN KEY (from_wallet_id) REFERENCES wallets(wallet_id),
	CONSTRAINT wallet_transactions_to_wallet_id_fkey FOREIGN KEY (to_wallet_id) REFERENCES wallets(wallet_id)
);


-- public.ai_generation_tasks definition

-- Drop table

-- DROP TABLE ai_generation_tasks;

CREATE TABLE ai_generation_tasks (
	task_id uuid DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NULL,
	status varchar(20) DEFAULT 'PENDING'::character varying NULL,
	source_asset_id uuid NULL,
	audit_score int4 NULL,
	ai_feedback_report jsonb NULL,
	points_reserved numeric(15, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT ai_generation_tasks_pkey PRIMARY KEY (task_id),
	CONSTRAINT ai_generation_tasks_source_asset_id_fkey FOREIGN KEY (source_asset_id) REFERENCES assets(asset_id),
	CONSTRAINT ai_generation_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id)
);


-- public.asset_exchanges definition

-- Drop table

-- DROP TABLE asset_exchanges;

CREATE TABLE asset_exchanges (
	exchange_id uuid DEFAULT gen_random_uuid() NOT NULL,
	buyer_enterprise_id uuid NULL,
	asset_id uuid NULL,
	points_spent numeric(15, 2) NULL,
	created_at timestamptz DEFAULT now() NULL,
	CONSTRAINT asset_exchanges_pkey PRIMARY KEY (exchange_id),
	CONSTRAINT asset_exchanges_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(asset_id),
	CONSTRAINT asset_exchanges_buyer_enterprise_id_fkey FOREIGN KEY (buyer_enterprise_id) REFERENCES enterprises(enterprise_id)
);
