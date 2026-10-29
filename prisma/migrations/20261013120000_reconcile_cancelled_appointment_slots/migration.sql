UPDATE "appointments"
SET "serialNumber" = NULL,
    "joiningTime" = NULL
WHERE "status" = 'CANCELLED';

UPDATE "schedules" AS schedule
SET "availableSlots" = GREATEST(
    schedule."totalSlots" - (
        SELECT COUNT(*)::INTEGER
        FROM "appointments" AS appointment
        WHERE appointment."scheduleId" = schedule."id"
          AND appointment."status" IN ('CONFIRMED', 'ONGOING', 'COMPLETED')
    ),
    0
);
