CREATE DATABASE IF NOT EXISTS it_asset_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE it_asset_db;

CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agent_id VARCHAR(10) NOT NULL UNIQUE,
    hostname VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    service_tag VARCHAR(50) NOT NULL UNIQUE,
    serial_number VARCHAR(100) NULL,
    cpu_model VARCHAR(150) NULL,
    cpu_cores INT NULL,
    ram_gb DECIMAL(5,2) NULL,
    os_name VARCHAR(100) NULL,
    os_version VARCHAR(50) NULL,
    os_arch VARCHAR(20) NULL,
    connection_status ENUM('active', 'disconnected', 'never_connected') DEFAULT 'disconnected',
    last_scan DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_service_tag (service_tag),
    INDEX idx_agent_id (agent_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dell_warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL UNIQUE,
    service_tag VARCHAR(50) NOT NULL,
    warranty_status ENUM('Active', 'Expired', 'Unknown') DEFAULT 'Unknown',
    start_date DATE NULL,
    end_date DATE NULL,
    service_level VARCHAR(150) NULL,
    last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    INDEX idx_warranty_service_tag (service_tag)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ldap_uid VARCHAR(100) NOT NULL UNIQUE, -- sAMAccountName o uid de LDAP
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(120) NOT NULL,
    department VARCHAR(100) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ldap_uid (ldap_uid)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    user_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    returned_at TIMESTAMP NULL,
    status ENUM('ACTIVE', 'RETURNED') DEFAULT 'ACTIVE',
    notes TEXT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_assignment_status (status)
) ENGINE=InnoDB;

INSERT INTO devices (
    agent_id, hostname, ip_address, service_tag, serial_number, 
    cpu_model, cpu_cores, ram_gb, os_name, os_version, os_arch, 
    connection_status, last_scan
) VALUES (
    '003', 'DELL-MATEO', '192.168.2.231', 'F9LNZ24', '/F9LNZ24/VNWSV0046G001V/',
    'Intel(R) Core(TM) Ultra 7 155H', 22, 63.50, 'Microsoft Windows 11 Pro', 
    '10.0.26200.9457', 'x86_64', 'disconnected', '2026-10-08 20:13:51'
) ON DUPLICATE KEY UPDATE id=id;

INSERT INTO dell_warranties (device_id, service_tag, warranty_status, start_date, end_date, service_level)
VALUES (
    1, 'F9LNZ24', 'Active', '2024-10-01', '2027-10-01', 'ProSupport Plus with Accidental Damage'
) ON DUPLICATE KEY UPDATE id=id;

INSERT INTO users (ldap_uid, full_name, email, department) VALUES 
('mrivera', 'Mateo Rivera', 'mrivera@empresa.local', 'Cybersecurity & Infrastructure'),
('jdoe', 'John Doe', 'jdoe@empresa.local', 'Data Analytics')
ON DUPLICATE KEY UPDATE id=id;
