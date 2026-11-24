ALTER TABLE investigation_source_attempts DROP CONSTRAINT investigation_source_attempts_source_check;
ALTER TABLE investigation_source_attempts ADD CONSTRAINT investigation_source_attempts_source_check
 CHECK(source IN ('prometheus','ecs','loki','tempo','github','cloudwatch','cost','dr','kubernetes','cloudwatch-logs'));
