/**
 * Apotool & Box UI セレクタ定義
 * アポツールのUI変更時はこのファイルのみ修正する
 */
export const selectors = {
    // ─── ログイン画面 ───
    login: {
        emailInput: '#email',
        passwordInput: '#password',
        submitButton: 'button[type="submit"]',
    },

    // ─── カレンダー画面 ───
    calendar: {
        patientSearch: '#patient_search',
    },

    // ─── 予約編集ダイアログ ───
    booking: {
        dialogTitle: '.ui-dialog-title',
        closeButton: '.ui-dialog-titlebar-close',

        // 患者情報
        newPatientLink: 'a:has-text("新患登録"), text=新患登録',
        newPatientNameInput: 'input[placeholder*="新規患者名"]',
        phoneInput: 'input[placeholder*="電話番号"]',

        // 時間設定
        startHour: 'select[name="starts_at_hr"]',
        startMinute: 'select[name="starts_at_mi"]',
        endHour: 'select[name="ends_at_hr"]',
        endMinute: 'select[name="ends_at_mi"]',

        // メニュー
        menu1: 'select[name="menu_id"]',
        menu2: 'select[name="menu2_id"]',

        // 担当
        staff1: 'select[name="staff_id"]',

        // ユニット
        unitSelect: 'select[name="unit_name_setting_id"]',

        // ボタン
        registerButton: 'button:has-text("登録"), input[type="submit"][value*="登録"], a:has-text("登録")',
    },
};
