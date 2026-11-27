CREATE TABLE `sucursales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `telefono` VARCHAR(20) NOT NULL,
    `direccion` VARCHAR(255) NOT NULL,
    `comuna` VARCHAR(80) NOT NULL DEFAULT 'Quinta Normal',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sucursales_activo_orden_idx`(`activo`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `sucursales` (`nombre`, `telefono`, `direccion`, `comuna`, `activo`, `orden`, `updated_at`)
VALUES ('Sucursal Quinta Normal', '56929163138', 'Av. Aviador Bleriot 2241', 'Quinta Normal', true, 1, CURRENT_TIMESTAMP(3));

ALTER TABLE `pedidos` ADD COLUMN `sucursal_id` INTEGER NULL;
CREATE INDEX `pedidos_sucursal_id_idx` ON `pedidos`(`sucursal_id`);
UPDATE `pedidos` SET `sucursal_id` = (SELECT `id` FROM `sucursales` WHERE `nombre` = 'Sucursal Quinta Normal' ORDER BY `id` LIMIT 1);
ALTER TABLE `pedidos` ADD CONSTRAINT `pedidos_sucursal_id_fkey` FOREIGN KEY (`sucursal_id`) REFERENCES `sucursales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
