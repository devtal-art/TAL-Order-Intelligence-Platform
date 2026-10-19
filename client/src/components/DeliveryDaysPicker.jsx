export const THIRD_PARTY = '3rd Party';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', THIRD_PARTY];

// Weekday toggle chips (plus a "3rd Party" option) — pick one or more.
export default function DeliveryDaysPicker({ value = [], onChange, disabled = false }) {
  const toggle = (day) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day];
    onChange(WEEKDAYS.filter((d) => next.includes(d)));
  };
  return (
    <div className="dd-picker" role="group" aria-label="Delivery days">
      {WEEKDAYS.map((day) => (
        <button
          key={day}
          type="button"
          className={`dd-chip${value.includes(day) ? ' is-on' : ''}`}
          aria-pressed={value.includes(day)}
          disabled={disabled}
          onClick={() => toggle(day)}
        >
          {day === THIRD_PARTY ? day : day.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}
