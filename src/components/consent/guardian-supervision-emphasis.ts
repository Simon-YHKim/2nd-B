import dayjs from "dayjs";
import { isValidISO } from "../m3/date-picker/calendar-math";

const GUARDIAN_NOTICE_ADULT_AGE = 18;

/** Display only: independent of the registration floor and residence country. */
export function shouldEmphasizeGuardianSupervision(
  birthDate: string,
  now: Date = new Date(),
): boolean {
  if (!isValidISO(birthDate)) return false;
  const birth = dayjs(birthDate);
  if (birth.isAfter(now, "day")) return false;
  const age = dayjs(now).diff(birth, "year");
  return age >= 0 && age < GUARDIAN_NOTICE_ADULT_AGE;
}
