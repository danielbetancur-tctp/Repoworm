-- Ejecutar como usuario administrador de PostgreSQL
CREATE ROLE iot_user WITH LOGIN PASSWORD 'cambiar_esta_clave';
CREATE DATABASE iot_lombrices OWNER iot_user;

-- Conectarse a iot_lombrices y conceder permisos sobre public
\c iot_lombrices
GRANT ALL ON SCHEMA public TO iot_user;
ALTER SCHEMA public OWNER TO iot_user;
