export type Migration = {
  id: string;
  statements: string[];
};

export const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','receptionist','trainer') NOT NULL DEFAULT 'receptionist',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS members (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_code VARCHAR(20) NOT NULL UNIQUE,
        first_name VARCHAR(80) NOT NULL,
        last_name VARCHAR(80) NOT NULL,
        email VARCHAR(190) NULL,
        phone VARCHAR(30) NOT NULL,
        gender ENUM('male','female','other') NULL,
        dob DATE NULL,
        address VARCHAR(255) NULL,
        photo_url VARCHAR(500) NULL,
        emergency_contact VARCHAR(120) NULL,
        join_date DATE NOT NULL,
        status ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
        notes TEXT NULL,
        deleted_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_members_phone (phone),
        INDEX idx_members_status (status),
        INDEX idx_members_name (last_name, first_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS plans (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        duration_days INT UNSIGNED NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description VARCHAR(255) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS subscriptions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NOT NULL,
        plan_id INT UNSIGNED NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('active','expired','frozen','cancelled') NOT NULL DEFAULT 'active',
        price_at_purchase DECIMAL(10,2) NOT NULL,
        discount DECIMAL(10,2) NOT NULL DEFAULT 0,
        final_amount DECIMAL(10,2) NOT NULL,
        frozen_at DATETIME NULL,
        notes VARCHAR(255) NULL,
        created_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subs_member (member_id, end_date),
        INDEX idx_subs_status (status, end_date),
        CONSTRAINT fk_subs_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
        CONSTRAINT fk_subs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS payments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_no VARCHAR(24) NOT NULL UNIQUE,
        member_id INT UNSIGNED NOT NULL,
        subscription_id INT UNSIGNED NULL,
        amount DECIMAL(10,2) NOT NULL,
        method ENUM('cash','card','bank','online') NOT NULL DEFAULT 'cash',
        status ENUM('paid','pending','refunded','failed') NOT NULL DEFAULT 'paid',
        paid_at DATETIME NOT NULL,
        notes VARCHAR(255) NULL,
        recorded_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_payments_member (member_id),
        INDEX idx_payments_paid_at (paid_at),
        INDEX idx_payments_status (status),
        CONSTRAINT fk_payments_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_payments_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
        CONSTRAINT fk_payments_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS trainers (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NULL,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NULL,
        phone VARCHAR(30) NULL,
        specialization VARCHAR(120) NULL,
        hire_date DATE NULL,
        status ENUM('active','inactive') NOT NULL DEFAULT 'active',
        notes VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_trainers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS trainer_assignments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        trainer_id INT UNSIGNED NOT NULL,
        member_id INT UNSIGNED NOT NULL,
        assigned_at DATE NOT NULL,
        ended_at DATE NULL,
        notes VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_assign_trainer (trainer_id, ended_at),
        INDEX idx_assign_member (member_id, ended_at),
        CONSTRAINT fk_assign_trainer FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE CASCADE,
        CONSTRAINT fk_assign_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS attendance (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NOT NULL,
        check_in_at DATETIME NOT NULL,
        check_out_at DATETIME NULL,
        method ENUM('manual','qr') NOT NULL DEFAULT 'manual',
        recorded_by INT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_att_member (member_id, check_in_at),
        INDEX idx_att_checkin (check_in_at),
        INDEX idx_att_open (check_out_at),
        CONSTRAINT fk_att_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_att_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NULL,
        subscription_id INT UNSIGNED NULL,
        type VARCHAR(32) NOT NULL,
        title VARCHAR(160) NOT NULL,
        body VARCHAR(255) NULL,
        read_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_notification_sub_type (subscription_id, type),
        INDEX idx_notifications_read (read_at),
        CONSTRAINT fk_notif_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_notif_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS audit_log (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NULL,
        action VARCHAR(60) NOT NULL,
        entity VARCHAR(40) NOT NULL,
        entity_id INT UNSIGNED NULL,
        meta JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_entity (entity, entity_id),
        CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(64) PRIMARY KEY,
        \`value\` TEXT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
  },
];
