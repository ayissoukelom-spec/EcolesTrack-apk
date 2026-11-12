import type { Absence } from "../types";
import { getAttendanceEventPresentation } from "../utils/attendancePresentation";

type AttendanceEventMarkerProps = {
  eventType?: Absence["eventType"];
};

export function AttendanceEventMarker({ eventType }: AttendanceEventMarkerProps) {
  const presentation = getAttendanceEventPresentation(eventType === "late" ? "late" : "absence");

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${presentation.badgeClassName}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${presentation.dotClassName}`} />
      {presentation.label}
    </span>
  );
}
