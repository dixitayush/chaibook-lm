export type CalendarEvent = {
  uid: string;
  title: string;
  start: string;
  end: string;
  location: string;
  attendees: string;
  description: string;
};

export function formatCalendarDocument(events: CalendarEvent[], calendarName = "Calendar") {
  if (!events.length) return "";
  const body = events
    .map((event) =>
      [
        event.title ? `Event: ${event.title}` : "Event",
        event.start ? `When: ${event.start}${event.end ? ` – ${event.end}` : ""}` : null,
        event.location ? `Where: ${event.location}` : null,
        event.attendees ? `Who: ${event.attendees}` : null,
        event.description ? event.description.trim() : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
  return `Calendar: ${calendarName}\n\n${body}`.trim();
}

export function parseCalendarInput(raw: string): CalendarEvent[] {
  const text = (raw || "").trim();
  if (!text) return [];
  if (/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) return parseIcs(text);
  return [
    {
      uid: "pasted",
      title: "Calendar notes",
      start: "",
      end: "",
      location: "",
      attendees: "",
      description: text.slice(0, 400_000),
    },
  ];
}

function parseIcs(raw: string): CalendarEvent[] {
  const unfolded = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const events: CalendarEvent[] = [];
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] || "";
    const uid = icsField(body, "UID") || `evt_${events.length + 1}`;
    events.push({
      uid,
      title: unescapeIcs(icsField(body, "SUMMARY") || "Untitled event"),
      start: formatIcsDate(icsField(body, "DTSTART")),
      end: formatIcsDate(icsField(body, "DTEND")),
      location: unescapeIcs(icsField(body, "LOCATION")),
      attendees: icsFields(body, "ATTENDEE")
        .map((value) => value.match(/CN=([^;:]+)/i)?.[1] || value.replace(/^mailto:/i, ""))
        .filter(Boolean)
        .join(", "),
      description: unescapeIcs(icsField(body, "DESCRIPTION")).slice(0, 20_000),
    });
  }
  return events.slice(0, 200);
}

function icsField(block: string, name: string) {
  const match = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "im"));
  return (match?.[1] || "").trim();
}

function icsFields(block: string, name: string) {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "gim");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) out.push(match[1].trim());
  return out;
}

function unescapeIcs(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function formatIcsDate(value: string) {
  if (!value) return "";
  const compact = value.replace(/[^0-9TZ]/g, "");
  const m = compact.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  if (!h) return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d} ${h}:${mi}${m[7] ? " UTC" : ""}`;
}
