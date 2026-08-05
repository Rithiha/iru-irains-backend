-- Local development schema + seed data for the iru-irains-backend.
--
-- This file is used ONLY to make the backend runnable in a fresh Cloud Agent
-- environment. The production database is managed separately and this file is
-- intentionally minimal: it creates the tables the API reads/writes and seeds a
-- small, deterministic rainfall dataset so every endpoint returns real data.
--
-- The whole script is idempotent: it can be re-run any number of times without
-- error or duplicate rows.

-- ---------------------------------------------------------------------------
-- Reference / auth tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login (
    id       SERIAL PRIMARY KEY,
    username VARCHAR UNIQUE,
    password VARCHAR,
    name     VARCHAR
);

CREATE TABLE IF NOT EXISTS normal_district_details (
    id             SERIAL PRIMARY KEY,
    district_code  BIGINT UNIQUE,
    district_name  VARCHAR,
    new_state_code BIGINT,
    state_name     VARCHAR,
    region_code    BIGINT,
    region_name    VARCHAR,
    subdiv_code    BIGINT,
    subdiv_name    VARCHAR,
    district_area  NUMERIC
);

CREATE TABLE IF NOT EXISTS station_details (
    station_code     BIGINT PRIMARY KEY,
    district_code    BIGINT,
    station_name     VARCHAR,
    station_type     VARCHAR,
    station_type_old VARCHAR,
    centre_type      VARCHAR,
    centre_name      VARCHAR,
    is_new_station   INTEGER,
    latitude         DECIMAL,
    longitude        DECIMAL,
    activationdate   DATE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Observation tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS station_daily_data (
    id              SERIAL PRIMARY KEY,
    station_id      NUMERIC,
    district_code   BIGINT,
    collection_date DATE,
    data            NUMERIC,
    is_verified     INTEGER DEFAULT 0,
    verified_at     TIMESTAMP,
    verified_by     NUMERIC,
    UNIQUE (station_id, collection_date)
);

CREATE TABLE IF NOT EXISTS station_logs (
    id            SERIAL PRIMARY KEY,
    station_code  BIGINT,
    station_name  VARCHAR,
    district_code BIGINT,
    log_date      TIMESTAMP,
    userid        BIGINT,
    log_type      VARCHAR
);

-- ---------------------------------------------------------------------------
-- Email tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
    id       SERIAL PRIMARY KEY,
    email    VARCHAR,
    subject  VARCHAR,
    message  TEXT,
    datetime TIMESTAMP,
    status   BOOLEAN
);

CREATE TABLE IF NOT EXISTS email_group (
    id        SERIAL PRIMARY KEY,
    groupname VARCHAR UNIQUE,
    emails    JSONB
);

-- ---------------------------------------------------------------------------
-- "Normal" (climatological baseline) tables, keyed by date
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS normal_country (
    id             SERIAL PRIMARY KEY,
    date           DATE UNIQUE,
    rainfall_value NUMERIC
);

CREATE TABLE IF NOT EXISTS normal_region (
    id             SERIAL PRIMARY KEY,
    region_id      BIGINT,
    date           DATE,
    rainfall_value NUMERIC,
    UNIQUE (region_id, date)
);

CREATE TABLE IF NOT EXISTS normal_state (
    id             SERIAL PRIMARY KEY,
    state_code     BIGINT,
    date           DATE,
    rainfall_value NUMERIC,
    UNIQUE (state_code, date)
);

CREATE TABLE IF NOT EXISTS normal_sub_division (
    id             SERIAL PRIMARY KEY,
    sub_division_id BIGINT,
    date           DATE,
    rainfall_value NUMERIC,
    UNIQUE (sub_division_id, date)
);

CREATE TABLE IF NOT EXISTS normal_district (
    id                         SERIAL PRIMARY KEY,
    normal_district_details_id INTEGER,
    date                       DATE,
    rainfall_value             NUMERIC,
    UNIQUE (normal_district_details_id, date)
);

-- ===========================================================================
-- Seed data
-- ===========================================================================
INSERT INTO login (username, password, name) VALUES
    ('admin', 'admin123', 'MC RANCHI')
ON CONFLICT (username) DO NOTHING;

INSERT INTO normal_district_details
    (id, district_code, district_name, new_state_code, state_name, region_code, region_name, subdiv_code, subdiv_name, district_area)
VALUES
    (1, 10101, 'Ranchi', 101, 'Jharkhand', 1, 'East India', 11, 'Jharkhand', 100),
    (2, 10102, 'Bokaro', 101, 'Jharkhand', 1, 'East India', 11, 'Jharkhand', 80)
ON CONFLICT (district_code) DO NOTHING;

INSERT INTO station_details
    (station_code, district_code, station_name, station_type, station_type_old, centre_type, centre_name, is_new_station, latitude, longitude, activationdate)
VALUES
    (1010101, 10101, 'Ranchi AWS', 'AWS', 'ARG', 'MC', 'RANCHI', 0, 23.34, 85.31, '2020-01-01'),
    (1010201, 10102, 'Bokaro AWS', 'AWS', 'ARG', 'MC', 'RANCHI', 1, 23.66, 85.98, '2021-05-10')
ON CONFLICT (station_code) DO NOTHING;

INSERT INTO station_daily_data (station_id, district_code, collection_date, data, is_verified) VALUES
    (1010101, 10101, '2024-06-01', 25.5, 0),
    (1010101, 10101, '2024-06-02', 10.0, 0),
    (1010101, 10101, '2024-06-03',  0.0, 0),
    (1010201, 10102, '2024-06-01', 12.0, 0),
    (1010201, 10102, '2024-06-02',  5.5, 0),
    (1010201, 10102, '2024-06-03', -999.9, 0)
ON CONFLICT (station_id, collection_date) DO NOTHING;

INSERT INTO normal_country (date, rainfall_value) VALUES
    ('2024-06-01', 19.0), ('2024-06-02', 19.0), ('2024-06-03', 19.0)
ON CONFLICT (date) DO NOTHING;

INSERT INTO normal_region (region_id, date, rainfall_value) VALUES
    (1, '2024-06-01', 19.0), (1, '2024-06-02', 19.0), (1, '2024-06-03', 19.0)
ON CONFLICT (region_id, date) DO NOTHING;

INSERT INTO normal_state (state_code, date, rainfall_value) VALUES
    (101, '2024-06-01', 19.0), (101, '2024-06-02', 19.0), (101, '2024-06-03', 19.0)
ON CONFLICT (state_code, date) DO NOTHING;

INSERT INTO normal_sub_division (sub_division_id, date, rainfall_value) VALUES
    (11, '2024-06-01', 19.0), (11, '2024-06-02', 19.0), (11, '2024-06-03', 19.0)
ON CONFLICT (sub_division_id, date) DO NOTHING;

INSERT INTO normal_district (normal_district_details_id, date, rainfall_value) VALUES
    (1, '2024-06-01', 20.0), (1, '2024-06-02', 20.0), (1, '2024-06-03', 20.0),
    (2, '2024-06-01', 18.0), (2, '2024-06-02', 18.0), (2, '2024-06-03', 18.0)
ON CONFLICT (normal_district_details_id, date) DO NOTHING;

INSERT INTO email_group (groupname, emails) VALUES
    ('Default Group', '{"mails": ["ops@example.com", "alerts@example.com"]}')
ON CONFLICT (groupname) DO NOTHING;

-- A sample activity log whose district_code matches a seeded district so the
-- fetchStationLogs endpoint (which joins on district_code) returns data.
INSERT INTO station_logs (station_code, station_name, district_code, log_date, userid, log_type)
SELECT 1010101, 'Ranchi AWS', 10101, CURRENT_TIMESTAMP, 111, 'added'
WHERE NOT EXISTS (
    SELECT 1 FROM station_logs WHERE station_code = 1010101 AND log_type = 'added'
);
