-- ====================================================================
-- R Racer MariaDB / MySQL Production Schema
-- Target: Hostinger MariaDB 11.8.9
-- Target Database: u911703995_rracer
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Users
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `email` VARCHAR(255) GENERATED ALWAYS AS (LOWER(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.email')))) STORED,
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 2. Cars
CREATE TABLE IF NOT EXISTS `cars` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 3. Images metadata
CREATE TABLE IF NOT EXISTS `images` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `media_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.mediaId'))) STORED,
  KEY `idx_images_media` (`media_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 4. Bookings
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `car_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.carId'))) STORED,
  `user_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.userId'))) STORED,
  `start_date` VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.startDate'))) STORED,
  KEY `idx_bookings_car` (`car_id`),
  KEY `idx_bookings_user` (`user_id`),
  KEY `idx_bookings_start` (`start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 5. Rental reservation slots (prevents conflicting bookings)
CREATE TABLE IF NOT EXISTS `slots` (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `car_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.carId'))) STORED,
  `slot_day` VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.day'))) STORED,
  `booking_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.bookingId'))) STORED,
  UNIQUE KEY `uk_slots_car_day` (`car_id`, `slot_day`),
  KEY `idx_slots_booking` (`booking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 6. Enquiries
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `created_at` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.createdAt'))) STORED,
  KEY `idx_enquiries_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 7. Settings
CREATE TABLE IF NOT EXISTS `settings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 8. Audit logs
CREATE TABLE IF NOT EXISTS `audit` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 9. Active sessions
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL,
  `user_id` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.userId'))) STORED,
  `expires_at` VARCHAR(64) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$.expiresAt'))) STORED,
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 10. Notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payload` JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 11. Media binary storage (stores images on Hostinger MariaDB)
CREATE TABLE IF NOT EXISTS `media` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `bytes` LONGBLOB NOT NULL,
  `mime` VARCHAR(64) NOT NULL,
  `size_bytes` BIGINT NOT NULL,
  `sha256` VARCHAR(64) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_media_sha256` (`sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

-- 12. Schema migrations & import tracking
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` VARCHAR(128) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `details` LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;

SET FOREIGN_KEY_CHECKS = 1;
