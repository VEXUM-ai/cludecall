export const apotoolSelectors = {
  login: {
    emailInput: "#email",
    passwordInput: "#password",
    submitButton: 'button[type="submit"]',
  },
  booking: {
    newPatientLink: 'a:has-text("新患登録"), text=新患登録',
    startHour: 'select[name="starts_at_hr"]',
    startMinute: 'select[name="starts_at_mi"]',
    endHour: 'select[name="ends_at_hr"]',
    endMinute: 'select[name="ends_at_mi"]',
    menu1: 'select[name="menu_id"]',
    menu2: 'select[name="menu2_id"]',
    staff1: 'select[name="staff_id"]',
  },
} as const;
