-- Payment Gateway System Database Schema

-- Drop tables if exist (for clean setup)
DROP TABLE IF EXISTS transaction_history CASCADE;
DROP TABLE IF EXISTS settlements CASCADE;
DROP TABLE IF EXISTS ledger CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS merchant_agents CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(255) UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'merchant')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agents Table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(255) NOT NULL,
  api_endpoint VARCHAR(500) NOT NULL,
  api_key VARCHAR(500) NOT NULL,
  payload_structure JSONB DEFAULT '{}',
  webhook_secret VARCHAR(255) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Merchants Table
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_name VARCHAR(255) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 7.00,
  agent_commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  api_key VARCHAR(255) UNIQUE,
  settlement_bank_name VARCHAR(255),
  settlement_account VARCHAR(255),
  settlement_ifsc VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Merchant-Agent Assignment (many-to-many, one primary)
CREATE TABLE merchant_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(merchant_id, agent_id)
);

-- Payments Table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  agent_id UUID REFERENCES agents(id),
  amount DECIMAL(15,2) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  reference_id VARCHAR(255) UNIQUE,
  bank_name VARCHAR(255),
  account_number VARCHAR(255),
  account_holder_name VARCHAR(255),
  ifsc VARCHAR(50),
  upi_id VARCHAR(255),
  qr_code TEXT,
  utr VARCHAR(255),
  webhook_url TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_transfer', 'utr_submitted', 'confirmed', 'failed', 'expired')),
  merchant_commission DECIMAL(5,2),
  agent_commission DECIMAL(5,2),
  platform_fee_amount DECIMAL(15,2),
  merchant_credit_amount DECIMAL(15,2),
  agent_fee_amount DECIMAL(15,2),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Ledger Table
CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  payment_id UUID REFERENCES payments(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('credit', 'debit', 'fee', 'settlement', 'reversal')),
  amount DECIMAL(15,2) NOT NULL,
  balance DECIMAL(15,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settlements Table
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  amount DECIMAL(15,2) NOT NULL,
  bank_name VARCHAR(255),
  account_number VARCHAR(255),
  ifsc VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transaction History / Audit Log
CREATE TABLE transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  payment_id UUID REFERENCES payments(id),
  event VARCHAR(100) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_payments_merchant_id ON payments(merchant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_reference_id ON payments(reference_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_ledger_merchant_id ON ledger(merchant_id);
CREATE INDEX idx_ledger_created_at ON ledger(created_at);
CREATE INDEX idx_settlements_merchant_id ON settlements(merchant_id);
CREATE INDEX idx_transaction_history_payment_id ON transaction_history(payment_id);

-- Default Super Admin (password: Admin@123)
INSERT INTO users (name, email, username, password, role) VALUES (
  'Super Admin',
  'admin@paygateway.com',
  'admin',
  '$2a$10$rOJKPnrLvHjIvnpvYnWvFuqxQZ8hGzXmR3J2kL1pN7sD4cW6aM5Oe',
  'superadmin'
);