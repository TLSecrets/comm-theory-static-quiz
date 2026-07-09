/**
 * storage.js - localStorage分片存储封装
 * 独立存储：配置、答题记录、错题、收藏标签、计时、缓存
 * 含校验、压缩、归档、防重复逻辑
 */
const Storage = (() => {
  const KEYS = {
    config: 'csp_config',
    records: 'csp_records',
    recordsArchive: 'csp_records_archive',
    errors: 'csp_errors',
    collect: 'csp_collect',
    timer: 'csp_timer',
    cache: 'csp_cache'
  };
  // ===== 默认配置 =====
  const DEFAULT_CONFIG = {
    theme: 'light',
    fontSize: 'standard',
    formulaMono: true,
    animation: true,
    timerEnabled: true,
    timePerQuestion: 120, // 单题最大秒数
    timeoutWarn: true,
    timeoutMarkError: true,
    timerSound: true,
    soundCorrect: true,
    soundWrong: true,
    soundTimeout: true,
    autoCleanErrors: false,
    autoArchive: false,
    archiveDays: 3,
    shortcutEnabled: true,
    exitBehavior: 'ask', // 'ask' | 'keep' | 'clear'
    scoreSingle: 2,
    scoreJudge: 1,
    scoreCalc: 6,
    weakThreshold: 2
  };
  // ===== 配置操作 =====
  function getConfig() {
    try {
      const raw = localStorage.getItem(KEYS.config);
      return raw ? Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw)) : { ...DEFAULT_CONFIG };
    } catch(e) {
      return { ...DEFAULT_CONFIG };
    }
  }
  function saveConfig(cfg) {
    try {
      localStorage.setItem(KEYS.config, JSON.stringify(cfg));
    } catch(e) {
      console.warn('保存配置失败:', e.message);
    }
  }
  function updateConfig(key, val) {
    const cfg = getConfig();
    cfg[key] = val;
    saveConfig(cfg);
  }
  function resetConfig() {
    localStorage.setItem(KEYS.config, JSON.stringify(DEFAULT_CONFIG));
  }
  // ===== 答题记录 =====
  function getRecords() {
    try {
      const raw = localStorage.getItem(KEYS.records);
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }
  function saveRecords(records) {
    try {
      localStorage.setItem(KEYS.records, JSON.stringify(records));
    } catch(e) {
      console.warn('保存答题记录失败，可能数据量过大:', e.message);
    }
  }
  /** 为某题添加一条答题记录 */
  function addRecord(qid, result) {
    const records = getRecords();
    if (!records[qid]) records[qid] = { correct: 0, wrong: 0, history: [] };
    if (result.correct) {
      records[qid].correct++;
    } else {
      records[qid].wrong++;
    }
    records[qid].history.push({
      time: Date.now(),
      correct: result.correct,
      duration: result.duration || 0
    });
    // 自动归档旧记录
    const cfg = getConfig();
    if (cfg.autoArchive && cfg.archiveDays > 0) {
      const cutoff = Date.now() - cfg.archiveDays * 86400000;
      const archive = getArchiveRecords();
      if (!archive[qid]) archive[qid] = { correct: 0, wrong: 0, history: [] };
      const recent = records[qid].history.filter(h => h.time >= cutoff);
      const old = records[qid].history.filter(h => h.time < cutoff);
      if (old.length > 0) {
        archive[qid].history.push(...old);
        archive[qid].correct += old.filter(h => h.correct).length;
        archive[qid].wrong += old.filter(h => !h.correct).length;
        records[qid].history = recent;
        // 重新统计当前correct/wrong（仅基于近期记录）
        records[qid].correct = recent.filter(h => h.correct).length;
        records[qid].wrong = recent.filter(h => !h.correct).length;
        savArchiveRecords(archive);
      }
    }
    saveRecords(records);
    // 自动清理错题
    if (cfg.autoCleanErrors && records[qid].correct > records[qid].wrong) {
      removeError(qid);
    }
    return records[qid];
  }
  function getArchiveRecords() {
    try {
      const raw = localStorage.getItem(KEYS.recordsArchive);
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }
  function savArchiveRecords(archive) {
    try {
      localStorage.setItem(KEYS.recordsArchive, JSON.stringify(archive));
    } catch(e) { console.warn('保存归档失败:', e.message); }
  }
  // ===== 错题操作 =====
  function getErrors() {
    try {
      const raw = localStorage.getItem(KEYS.errors);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }
  function saveErrors(errors) {
    try {
      localStorage.setItem(KEYS.errors, JSON.stringify(errors));
    } catch(e) { console.warn('保存错题失败:', e.message); }
  }
  function addError(qid) {
    const errors = getErrors();
    // 防重复
    if (!errors.includes(qid)) {
      errors.push(qid);
      saveErrors(errors);
    }
  }
  function removeError(qid) {
    let errors = getErrors();
    errors = errors.filter(id => id !== qid);
    saveErrors(errors);
  }
  function clearErrors() {
    localStorage.setItem(KEYS.errors, '[]');
  }
  function batchRemoveErrors(qids) {
    let errors = getErrors();
    errors = errors.filter(id => !qids.includes(id));
    saveErrors(errors);
  }
  // ===== 收藏操作 =====
  function getCollect() {
    try {
      const raw = localStorage.getItem(KEYS.collect);
      return raw ? JSON.parse(raw) : {}; // { qid: [tag1, tag2, ...] }
    } catch(e) { return {}; }
  }
  function saveCollect(collect) {
    try {
      localStorage.setItem(KEYS.collect, JSON.stringify(collect));
    } catch(e) { console.warn('保存收藏失败:', e.message); }
  }
  function toggleCollect(qid) {
    const collect = getCollect();
    if (collect[qid]) {
      delete collect[qid];
    } else {
      collect[qid] = [];
    }
    saveCollect(collect);
    return !!collect[qid];
  }
  function isCollected(qid) {
    return !!getCollect()[qid];
  }
  function addTag(qid, tag) {
    const collect = getCollect();
    if (!collect[qid]) collect[qid] = [];
    if (!collect[qid].includes(tag)) {
      collect[qid].push(tag);
      saveCollect(collect);
    }
  }
  function removeTag(qid, tag) {
    const collect = getCollect();
    if (collect[qid]) {
      collect[qid] = collect[qid].filter(t => t !== tag);
      saveCollect(collect);
    }
  }
  function getTags(qid) {
    const collect = getCollect();
    return collect[qid] || [];
  }
  function getAllTags() {
    const collect = getCollect();
    const tags = new Set();
    Object.values(collect).forEach(arr => arr.forEach(t => tags.add(t)));
    return [...tags].sort();
  }
  function clearCollect() {
    localStorage.setItem(KEYS.collect, '{}');
  }
  function batchRemoveCollect(qids) {
    const collect = getCollect();
    qids.forEach(id => delete collect[id]);
    saveCollect(collect);
  }
  // ===== 计时数据 =====
  function getTimer() {
    try {
      const raw = localStorage.getItem(KEYS.timer);
      return raw ? JSON.parse(raw) : { total: 0, perQuestion: {}, overtimes: [] };
    } catch(e) { return { total: 0, perQuestion: {}, overtimes: [] }; }
  }
  function saveTimer(timer) {
    try {
      localStorage.setItem(KEYS.timer, JSON.stringify(timer));
    } catch(e) { console.warn('保存计时失败:', e.message); }
  }
  function addTime(qid, duration, overtime) {
    const timer = getTimer();
    timer.total += duration;
    if (!timer.perQuestion[qid]) timer.perQuestion[qid] = [];
    timer.perQuestion[qid].push(duration);
    if (overtime) timer.overtimes.push({ qid, time: Date.now(), duration });
    saveTimer(timer);
  }
  // ===== 题库缓存 =====
  function getCachedQuestions() {
    try {
      const raw = localStorage.getItem(KEYS.cache);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }
  function cacheQuestions(questions) {
    try {
      localStorage.setItem(KEYS.cache, JSON.stringify(questions));
    } catch(e) { console.warn('缓存题库失败:', e.message); }
  }
  function clearCache() {
    localStorage.removeItem(KEYS.cache);
  }
  // ===== 数据导出/导入 =====
  function exportAll() {
    const data = {
      version: 1,
      exportTime: new Date().toISOString(),
      config: getConfig(),
      records: getRecords(),
      archive: getArchiveRecords(),
      errors: getErrors(),
      collect: getCollect(),
      timer: getTimer()
    };
    return JSON.stringify(data);
  }
  function importAll(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (!data || typeof data !== 'object') throw new Error('无效的数据格式');
      if (data.version !== 1) throw new Error('数据版本不兼容');
      // 校验必需字段
      const required = ['config', 'records', 'errors', 'collect', 'timer'];
      for (const key of required) {
        if (!(key in data)) throw new Error(`缺少字段: ${key}`);
      }
      if (typeof data.config !== 'object') throw new Error('config不是对象');
      if (typeof data.records !== 'object') throw new Error('records不是对象');
      if (!Array.isArray(data.errors)) throw new Error('errors不是数组');
      if (typeof data.collect !== 'object') throw new Error('collect不是对象');
      if (typeof data.timer !== 'object') throw new Error('timer不是对象');
      // 写入
      saveConfig(data.config);
      saveRecords(data.records);
      if (data.archive) savArchiveRecords(data.archive);
      saveErrors(data.errors);
      saveCollect(data.collect);
      saveTimer(data.timer);
      return true;
    } catch(e) {
      console.error('导入失败:', e.message);
      return false;
    }
  }
  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }
  // ===== 公共API =====
  return {
    KEYS,
    DEFAULT_CONFIG,
    getConfig, saveConfig, updateConfig, resetConfig,
    getRecords, saveRecords, addRecord, getArchiveRecords,
    getErrors, addError, removeError, clearErrors, batchRemoveErrors,
    getCollect, toggleCollect, isCollected, addTag, removeTag, getTags, getAllTags, clearCollect, batchRemoveCollect,
    getTimer, saveTimer, addTime,
    getCachedQuestions, cacheQuestions, clearCache,
    exportAll, importAll, resetAll
  };
})();