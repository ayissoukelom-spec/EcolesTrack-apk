import type { Absence } from "../types";
import {
  getAttendanceJustificationButtonColorClasses,
  getAttendanceJustificationCopy,
} from "../utils/attendanceJustification";

type AttendanceJustificationButtonProps = {
  eventType?: Absence["eventType"];
  onClick: () => void;
};

export function AttendanceJustificationButton({
  eventType,
  onClick,
}: AttendanceJustificationButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 w-full rounded-xl ${getAttendanceJustificationButtonColorClasses(eventType)} text-white text-[10px] font-bold uppercase tracking-wide py-2 transition-colors`}
    >
      {getAttendanceJustificationCopy(eventType).buttonLabel}
    </button>
  );
}
