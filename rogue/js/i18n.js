(() => {
  const STORAGE_KEY = 'rogue_lang_v1';
  const listeners = new Set();

  const ui = {
    en: {
      input_label: 'Input:',
      language_label: 'Language:',
      help_summary: 'Help: F1 | Inventory: i | Wait: . | Save: S | Quit: Q',
      btn_inventory: 'Inventory',
      btn_help: 'Help (F1)',
      btn_new_run: 'New Run',
      btn_legend: 'Legend (/)',
      btn_traps: 'Traps (^)',
      stats_title: 'Status',
      quick_title: 'Quick',
      quick_desc: 'Pointer mode: tap a tile to auto-walk (A*). Tap same tile to cancel.',
      log_title: 'Log',
      btn_pickup: 'Pickup (,)',
      btn_search: 'Search (s)',
      btn_down: 'Down (>)',
      btn_up: 'Up (<)',
      btn_close: 'Close',
    },
    ja: {
      input_label: '入力:',
      language_label: 'Language:',
      help_summary: 'ヘルプ: F1 | インベントリ: i | 待機: . | 保存: S | 終了: Q',
      btn_inventory: 'インベントリ',
      btn_help: 'ヘルプ (F1)',
      btn_new_run: '新規開始',
      btn_legend: '凡例 (/)',
      btn_traps: '罠 (^)',
      stats_title: 'ステータス',
      quick_title: 'クイック',
      quick_desc: 'ポインターモード: マスをタップで自動移動 (A*)。同じマスでキャンセル。',
      log_title: 'ログ',
      btn_pickup: '拾う (,)',
      btn_search: '探索 (s)',
      btn_down: '下り (>)',
      btn_up: '上り (<)',
      btn_close: '閉じる',
    },
  };

  const replacements = {
    ja: [
      ['Loaded game.', 'ゲームを読み込みました。'],
      ['Game saved.', 'ゲームを保存しました。'],
      ['Save failed.', '保存に失敗しました。'],
      ['No save found.', 'セーブデータがありません。'],
      ['Load failed (corrupt save).', '読み込みに失敗しました（破損データ）。'],
      ['Cancelled.', 'キャンセルしました。'],
      ['You wait.', '待機した。'],
      ['Nothing here.', 'ここには何もない。'],
      ['You are getting hungry.', '空腹になってきた。'],
      ['You are starving!', '飢えている！'],
      ['You open the door.', 'ドアを開けた。'],
      ['You close the door.', 'ドアを閉めた。'],
      ['No open door there.', 'そこに開いたドアはない。'],
      ['Something blocks the door.', '何かがドアを塞いでいる。'],
      ['Out of bounds.', '範囲外です。'],
      ['No enemy there.', 'そこに敵はいない。'],
      ['You died. Press New Run.', 'あなたは倒れた。New Run を押してください。'],
      ['Quit. Press New Run.', '終了しました。New Run を押してください。'],
      ['Quit the game?', 'ゲームを終了しますか？'],
      ['Are you sure?', '確認'],
      ['Input mode:', '入力モード:'],
      ['New run started.', '新しい冒険を開始しました。'],
      ['Destination must be explored.', '探索済みの場所のみ指定できます。'],
      ['Cannot path to that tile.', 'その地点へは移動できません。'],
      ['No path found.', '経路が見つかりません。'],
      ['Auto-walk cancelled.', '自動移動をキャンセルしました。'],
      ['Auto-walk stopped: enemy spotted.', '敵を発見したため自動移動を停止しました。'],
      ['Auto-walk stopped: path blocked.', '経路が塞がれたため自動移動を停止しました。'],
      ['Floor ', '階層 '],
      [' Turn ', ' ターン '],
      [' Food ', ' 満腹度 '],
      ['(GAME OVER)', '(ゲームオーバー)'],
      ['None', 'なし'],
      ['Full', '満腹'],
      ['Okay', '普通'],
      ['Hungry', '空腹'],
      ['Starving', '飢餓'],
      ['Fainted', '気絶'],
    ],
    en: [],
  };

  function safeGetLang() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'ja' || v === 'en') return v;
    } catch {}
    return 'en';
  }

  let lang = safeGetLang();

  function t(key) {
    const dict = ui[lang] || ui.en;
    return dict[key] ?? (ui.en[key] ?? key);
  }

  function tr(text) {
    if (typeof text !== 'string') return text;
    const table = replacements[lang] || [];
    let out = text;
    for (const [en, target] of table) out = out.split(en).join(target);
    return out;
  }

  function setLang(next) {
    if (!ui[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    for (const fn of listeners) fn(lang);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  window.RogueI18n = {
    getLang: () => lang,
    setLang,
    onChange,
    t,
    tr,
    ui,
  };
})();
