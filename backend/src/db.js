import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/isp_billing";

export const pool = new Pool({ connectionString });

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function initDb() {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

  await query(`
    CREATE TABLE IF NOT EXISTS isps (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE isps ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;");

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      isp_id UUID REFERENCES isps(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'isp_admin', 'billing_agent', 'noc_operator')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;");
  await query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (
      role IN (
        'super_admin',
        'company_manager',
        'isp_admin',
        'billing_agent',
        'noc_operator',
        'field_agent'
      )
    );
  `);
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;");
  await query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;"
  );
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS accreditation_level TEXT NOT NULL DEFAULT 'basic';");
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_totp_secret TEXT NULL;");
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;");

  await query(`
    CREATE TABLE IF NOT EXISTS user_mfa_challenges (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('login', 'withdrawal')),
      code_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      verified_at TIMESTAMP NULL
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_user_mfa_challenges_user ON user_mfa_challenges (user_id, purpose, status, expires_at DESC);");

  await query(`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;");
  await query(
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS must_set_password BOOLEAN NOT NULL DEFAULT FALSE;"
  );
  await query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT NULL;");

  await query(`
    CREATE TABLE IF NOT EXISTS plans (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_usd NUMERIC(10,2) NOT NULL,
      duration_days INTEGER NOT NULL,
      rate_limit TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS speed_label TEXT NULL;");
  await query(
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS default_access_type TEXT NOT NULL DEFAULT 'pppoe';"
  );
  await query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;");
  await query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE;");
  await query(
    "ALTER TABLE plans ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available';"
  );
  await query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS success_redirect_url TEXT NULL;");

  await query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL
    );
  `);
  await query(
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS access_type TEXT NOT NULL DEFAULT 'pppoe';"
  );
  await query(
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_simultaneous_devices INTEGER NULL;"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS wifi_guest_purchases (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
      deposit_id UUID NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      pawapay_provider TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      amount TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      subscription_id UUID NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
      customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
      redirect_url TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP NULL
    );
  `);
  await query(
    "ALTER TABLE wifi_guest_purchases ADD COLUMN IF NOT EXISTS subscriber_setup_token TEXT NULL;"
  );
  await query(`
    DO $wgp$ BEGIN
      ALTER TABLE wifi_guest_purchases DROP CONSTRAINT IF EXISTS wifi_guest_purchases_status_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $wgp$;
  `);
  await query(`
    ALTER TABLE wifi_guest_purchases
    ADD CONSTRAINT wifi_guest_purchases_status_check
    CHECK (status IN ('pending', 'completed', 'failed'))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount_usd NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL,
      due_date TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      provider_ref TEXT NOT NULL,
      amount_usd NUMERIC(10,2) NOT NULL,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      paid_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS isp_payment_methods (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      method_type TEXT NOT NULL CHECK (
        method_type IN (
          'pawapay',
          'onafriq',
          'paypal',
          'binance_pay',
          'crypto_wallet',
          'bank_transfer',
          'cash',
          'mobile_money',
          'gateway',
          'other'
        )
      ),
      provider_name TEXT NOT NULL,
      config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    DO $pm$ BEGIN
      ALTER TABLE isp_payment_methods DROP CONSTRAINT IF EXISTS isp_payment_methods_method_type_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $pm$;
  `);
  await query(`
    ALTER TABLE isp_payment_methods
    ADD CONSTRAINT isp_payment_methods_method_type_check
    CHECK (
      method_type IN (
        'pawapay',
        'onafriq',
        'paypal',
        'binance_pay',
        'crypto_wallet',
        'bank_transfer',
        'cash',
        'mobile_money',
        'gateway',
        'other'
      )
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS platform_packages (
      id UUID PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      monthly_price_usd NUMERIC(10,2) NOT NULL,
      feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS isp_platform_subscriptions (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      package_id UUID NOT NULL REFERENCES platform_packages(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'suspended')),
      starts_at TIMESTAMP NOT NULL,
      ends_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const subStatusConstraints = await query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'isp_platform_subscriptions' AND c.contype = 'c'
  `);
  for (const row of subStatusConstraints.rows) {
    await query(`ALTER TABLE isp_platform_subscriptions DROP CONSTRAINT IF EXISTS "${row.conname}"`);
  }
  await query(`
    ALTER TABLE isp_platform_subscriptions
    ADD CONSTRAINT isp_platform_subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended'))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS platform_saas_deposit_sessions (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      platform_subscription_id UUID NOT NULL REFERENCES isp_platform_subscriptions(id) ON DELETE CASCADE,
      deposit_id UUID NOT NULL UNIQUE,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      provider TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('initiated', 'completed', 'failed')) DEFAULT 'initiated',
      pawapay_init_status TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP NULL
    );
  `);
  await query(
    "ALTER TABLE platform_saas_deposit_sessions ADD COLUMN IF NOT EXISTS target_package_id UUID NULL REFERENCES platform_packages(id) ON DELETE SET NULL;"
  );
  await query("CREATE INDEX IF NOT EXISTS idx_platform_saas_deposits_isp ON platform_saas_deposit_sessions (isp_id);");

  await query(`
    CREATE TABLE IF NOT EXISTS isp_withdrawal_requests (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      amount_usd NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      phone_number TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
      payout_id UUID NULL UNIQUE,
      pawapay_init_status TEXT NULL,
      mobile_money_basis_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
      failure_message TEXT NULL,
      requested_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      mfa_challenge_id UUID NULL REFERENCES user_mfa_challenges(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP NULL
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_isp_withdrawals_isp ON isp_withdrawal_requests (isp_id, created_at DESC);");

  await query(`
    CREATE TABLE IF NOT EXISTS isp_role_profiles (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      role_key TEXT NOT NULL,
      accreditation_level TEXT NOT NULL DEFAULT 'basic',
      permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (isp_id, role_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS isp_branding (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL UNIQUE REFERENCES isps(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      logo_url TEXT NULL,
      primary_color TEXT NOT NULL DEFAULT '#1565d8',
      secondary_color TEXT NOT NULL DEFAULT '#162030',
      invoice_footer TEXT NULL,
      address TEXT NULL,
      contact_email TEXT NULL,
      contact_phone TEXT NULL,
      custom_domain TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE isp_branding ADD COLUMN IF NOT EXISTS wifi_portal_redirect_url TEXT NULL;");
  await query("ALTER TABLE isp_branding ADD COLUMN IF NOT EXISTS logo_object_key TEXT NULL;");

  await query(`
    CREATE TABLE IF NOT EXISTS isp_expenses (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      amount_usd NUMERIC(12,2) NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      field_agent_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      agent_payout_type TEXT NULL,
      agent_payout_percent NUMERIC(6,2) NULL,
      revenue_basis_usd NUMERIC(12,2) NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT isp_expenses_agent_payout_chk CHECK (
        agent_payout_type IS NULL OR agent_payout_type IN ('fixed', 'percentage')
      ),
      CONSTRAINT isp_expenses_period_chk CHECK (period_end >= period_start)
    );
  `);
  await query(
    "CREATE INDEX IF NOT EXISTS idx_isp_expenses_isp_period ON isp_expenses (isp_id, period_start DESC, period_end DESC);"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS network_usage_daily (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      hotspot_users INTEGER NOT NULL DEFAULT 0,
      pppoe_users INTEGER NOT NULL DEFAULT 0,
      connected_devices INTEGER NOT NULL DEFAULT 0,
      bandwidth_down_gb NUMERIC(12,2) NOT NULL DEFAULT 0,
      bandwidth_up_gb NUMERIC(12,2) NOT NULL DEFAULT 0,
      UNIQUE (isp_id, metric_date)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS isp_network_nodes (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      api_port INTEGER NOT NULL DEFAULT 443,
      use_tls BOOLEAN NOT NULL DEFAULT TRUE,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      default_pppoe_profile TEXT NOT NULL DEFAULT 'default',
      default_hotspot_profile TEXT NOT NULL DEFAULT 'default',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("ALTER TABLE isp_network_nodes ADD COLUMN IF NOT EXISTS password_enc TEXT NULL;");
  await query(
    "UPDATE isp_network_nodes SET password_enc = password WHERE password_enc IS NULL AND password IS NOT NULL;"
  );
  await query("CREATE INDEX IF NOT EXISTS idx_isp_network_nodes_isp ON isp_network_nodes (isp_id);");

  await query(`
    CREATE TABLE IF NOT EXISTS network_telemetry_snapshots (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      node_id UUID NOT NULL REFERENCES isp_network_nodes(id) ON DELETE CASCADE,
      pppoe_active INTEGER NOT NULL DEFAULT 0,
      hotspot_active INTEGER NOT NULL DEFAULT 0,
      connected_devices INTEGER NOT NULL DEFAULT 0,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    "CREATE INDEX IF NOT EXISTS idx_network_telemetry_isp_created ON network_telemetry_snapshots (isp_id, created_at DESC);"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS network_provisioning_events (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      node_id UUID NULL REFERENCES isp_network_nodes(id) ON DELETE SET NULL,
      subscription_id UUID NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
      action TEXT NOT NULL CHECK (action IN ('activate', 'suspend', 'sync')),
      access_type TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS freeradius_sync_events (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      subscription_id UUID NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('activate', 'suspend')),
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS radius_radcheck (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      attribute TEXT NOT NULL,
      op TEXT NOT NULL DEFAULT ':=',
      value TEXT NOT NULL
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS radius_radreply (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      attribute TEXT NOT NULL,
      op TEXT NOT NULL DEFAULT ':=',
      value TEXT NOT NULL
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_radius_radcheck_username ON radius_radcheck (username);");
  await query("CREATE INDEX IF NOT EXISTS idx_radius_radreply_username ON radius_radreply (username);");

  await query(`
    CREATE TABLE IF NOT EXISTS radius_accounting_ingest (
      id BIGSERIAL PRIMARY KEY,
      isp_id UUID NULL REFERENCES isps(id) ON DELETE SET NULL,
      username TEXT NULL,
      acct_session_id TEXT NULL,
      acct_status_type TEXT NULL,
      nas_ip_address TEXT NULL,
      framed_ip_address TEXT NULL,
      acct_input_octets BIGINT NULL,
      acct_output_octets BIGINT NULL,
      event_time TIMESTAMP NULL,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    "CREATE INDEX IF NOT EXISTS idx_radius_acct_ingest_isp_created ON radius_accounting_ingest (isp_id, created_at DESC);"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_radius_acct_ingest_username ON radius_accounting_ingest (username);"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS payment_tid_submissions (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      tid TEXT NOT NULL,
      submitted_by_phone TEXT NULL,
      amount_usd NUMERIC(10,2) NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP NULL,
      review_note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    "CREATE INDEX IF NOT EXISTS idx_tid_submissions_isp_tid ON payment_tid_submissions (isp_id, tid);"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS access_vouchers (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      code TEXT UNIQUE NOT NULL,
      rate_limit TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('unused', 'used', 'expired', 'revoked')),
      assigned_customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
      used_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    "ALTER TABLE access_vouchers ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;"
  );

  await query(`
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp', 'internal')),
      recipient TEXT NULL,
      template_key TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(
    "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;"
  );
  await query(
    "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS last_error TEXT NULL;"
  );
  await query(
    "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP NULL;"
  );
  await query(
    "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP NOT NULL DEFAULT NOW();"
  );
  await query(
    "ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS provider_message_id TEXT NULL;"
  );
  await query(`
    CREATE TABLE IF NOT EXISTS isp_notification_providers (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
      provider_key TEXT NOT NULL CHECK (provider_key IN ('webhook', 'twilio', 'smtp')),
      config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (isp_id, channel)
    );
  `);
  await query("ALTER TABLE isp_notification_providers DROP CONSTRAINT IF EXISTS isp_notification_providers_provider_key_check;");
  await query(`
    ALTER TABLE isp_notification_providers
    ADD CONSTRAINT isp_notification_providers_provider_key_check
    CHECK (provider_key IN ('webhook', 'twilio', 'smtp'));
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customer_portal_tokens (
      id UUID PRIMARY KEY,
      isp_id UUID NOT NULL REFERENCES isps(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_customer_portal_tokens_token ON customer_portal_tokens (token);");

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY,
      isp_id UUID REFERENCES isps(id) ON DELETE CASCADE,
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const ispCount = await query("SELECT COUNT(*)::int AS count FROM isps");
  if (ispCount.rows[0].count === 0) {
    await query(
      "INSERT INTO isps (id, name, location, contact_phone) VALUES (gen_random_uuid(), $1, $2, $3)",
      ["DemoNet DRC", "Kinshasa", "+243990000111"]
    );
  }

  await query(
    "UPDATE isps SET subdomain = CONCAT('tenant-', RIGHT(REPLACE(id::text, '-', ''), 8), '.example-tenant.local') WHERE subdomain IS NULL"
  );

  await query(`
    INSERT INTO isp_branding (id, isp_id, display_name, contact_phone)
    SELECT gen_random_uuid(), i.id, i.name, i.contact_phone
    FROM isps i
    LEFT JOIN isp_branding b ON b.isp_id = i.id
    WHERE b.id IS NULL;
  `);

  await query(`
    INSERT INTO network_usage_daily (id, isp_id, metric_date, hotspot_users, pppoe_users, connected_devices, bandwidth_down_gb, bandwidth_up_gb)
    SELECT
      gen_random_uuid(),
      i.id,
      CURRENT_DATE,
      5,
      12,
      19,
      48.5,
      12.2
    FROM isps i
    LEFT JOIN network_usage_daily n ON n.isp_id = i.id AND n.metric_date = CURRENT_DATE
    WHERE n.id IS NULL;
  `);

  await query(`
    INSERT INTO isp_notification_providers (id, isp_id, channel, provider_key, config_json, is_active)
    SELECT gen_random_uuid(), i.id, x.channel, 'webhook', '{}'::jsonb, FALSE
    FROM isps i
    CROSS JOIN (VALUES ('sms'), ('email'), ('whatsapp')) AS x(channel)
    ON CONFLICT (isp_id, channel) DO NOTHING;
  `);

  const adminCount = await query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'super_admin'");
  if (adminCount.rows[0].count === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await query(
      "INSERT INTO users (id, isp_id, full_name, email, password_hash, role, is_active, must_change_password) VALUES (gen_random_uuid(), NULL, $1, $2, $3, 'super_admin', TRUE, FALSE)",
      ["Platform Admin", "admin@isp.local", hash]
    );
  }

  await query(`
    INSERT INTO platform_packages (id, code, name, monthly_price_usd, feature_flags) VALUES
      (gen_random_uuid(), 'essential', 'Essential', 10,
        '{"maxUsers":5,"maxNetworkNodes":3,"advancedAnalytics":false,"customDomain":false}'::jsonb),
      (gen_random_uuid(), 'pro', 'Pro', 15,
        '{"maxUsers":20,"maxNetworkNodes":3,"advancedAnalytics":true,"customDomain":false}'::jsonb),
      (gen_random_uuid(), 'business', 'Business', 20,
        '{"maxUsers":80,"maxNetworkNodes":10,"advancedAnalytics":true,"customDomain":true}'::jsonb)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      monthly_price_usd = EXCLUDED.monthly_price_usd,
      feature_flags = EXCLUDED.feature_flags
  `);
  await query(`
    DELETE FROM platform_packages pp
    WHERE pp.code IN ('starter', 'growth', 'enterprise')
      AND NOT EXISTS (SELECT 1 FROM isp_platform_subscriptions s WHERE s.package_id = pp.id)
  `);
}
