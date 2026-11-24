ALTER TABLE connector_instances DROP CONSTRAINT connector_instances_provider_check;
ALTER TABLE connector_instances ADD CONSTRAINT connector_instances_provider_check
 CHECK(provider IN ('prometheus','loki','tempo','grafana','github','ntfy','slack','kubernetes','ecs'));
