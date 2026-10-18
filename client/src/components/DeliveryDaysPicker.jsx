export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Weekday toggle chips — pick one or more delivery days.
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
          {day.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}
