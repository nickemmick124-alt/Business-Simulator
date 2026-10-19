/** Calendar helpers shared by simulation, analytics, and views. No engine imports. */
const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

export function campaignLength(state) {
  return state?.version === '1.2.0' && state.campaignMonths === 36 ? 36 : 12;
}

export function calendarMonth(month) {
  return ((Math.max(1, Math.floor(month)) - 1) % 12) + 1;
}

export function campaignYear(month) {
  return Math.floor((Math.max(1, Math.floor(month)) - 1) / 12) + 1;
}

export function monthLabel(month, { short = false, includeYear = true } = {}) {
  if (typeof month !== 'number' || !Number.isFinite(month) || month < 0) return '—';
  if (month === 0) return 'Opening';
  const name = MONTH_NAMES[calendarMonth(month) - 1];
  return `${short ? name.slice(0, 3) : name}${includeYear ? ` · Year ${campaignYear(month)}` : ''}`;
}

/** End of the year containing the next decision, or the final campaign month. */
export function campaignYearEnd(state) {
  return Math.min(campaignLength(state), Math.ceil((Math.max(0, state.month) + 1) / 12) * 12);
}

export function isCyclicalState(state) {
  return state?.version === '1.1.0' || state?.version === '1.2.0';
}
