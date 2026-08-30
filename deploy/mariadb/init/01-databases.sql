-- Created on first MariaDB volume init only.
CREATE DATABASE IF NOT EXISTS `comp_hack` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `world` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'smt'@'%' IDENTIFIED BY 'smt_change_me';
CREATE USER IF NOT EXISTS 'smt'@'127.0.0.1' IDENTIFIED BY 'smt_change_me';
CREATE USER IF NOT EXISTS 'smt'@'localhost' IDENTIFIED BY 'smt_change_me';

GRANT ALL PRIVILEGES ON `comp_hack`.* TO 'smt'@'%';
GRANT ALL PRIVILEGES ON `world`.* TO 'smt'@'%';
GRANT ALL PRIVILEGES ON `comp_hack`.* TO 'smt'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `world`.* TO 'smt'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `comp_hack`.* TO 'smt'@'localhost';
GRANT ALL PRIVILEGES ON `world`.* TO 'smt'@'localhost';
FLUSH PRIVILEGES;
