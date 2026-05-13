-- 1. 強制開啟 UUID 支援
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. 企業帳號表 (移除原本可能造成錯誤的重複定義，並確保 UUID 運作)
CREATE TABLE IF NOT EXISTS Enterprises (
    enterprise_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_id VARCHAR(10) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    vip_level INT DEFAULT 1,
    security_score DECIMAL(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 使用者帳號表
CREATE TABLE IF NOT EXISTS Users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES Enterprises(enterprise_id) ON DELETE CASCADE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    user_role VARCHAR(50) DEFAULT 'USER',
    wallet_points DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 數位資產表 (CAXN 核心素材)
CREATE TABLE IF NOT EXISTS Assets (
    asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_enterprise_id UUID REFERENCES Enterprises(enterprise_id) ON DELETE CASCADE,
    asset_type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_url TEXT,
    required_points DECIMAL(15, 2),
    contribution_pts_reward DECIMAL(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. AI 任務紀錄表 (Gemini 串接紀錄)
CREATE TABLE IF NOT EXISTS AI_Generation_Tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES Users(user_id),
    status VARCHAR(20) DEFAULT 'PENDING',
    source_asset_id UUID REFERENCES Assets(asset_id),
    audit_score INT,
    ai_feedback_report JSONB,
    points_reserved DECIMAL(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);