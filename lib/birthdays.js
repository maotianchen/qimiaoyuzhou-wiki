'use strict';

const storage = require('./storage');

// 解析 birthday 字段("M月D日" 或 "M.D" 等)为 {month, day}。
function parseBirthday(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{1,2})\s*[月\.\-/]\s*(\d{1,2})/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

// 计算某生日距离 today 的下一次天数(0=今天, 否则未来)。
function daysUntil(bd, today) {
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const thisYear = new Date(today.getFullYear(), bd.month - 1, bd.day);
  const diff = Math.round((thisYear - today) / 86400000);
  if (diff >= 0) return diff;
  // 今年已过,看明年
  const nextYear = new Date(today.getFullYear() + 1, bd.month - 1, bd.day);
  return Math.round((nextYear - today) / 86400000);
}

// 返回生日信息:今天生日的角色列表 + 最近的下一个生日(含距离天数)。
function birthdayInfo() {
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  const roles = storage.listPages().filter((p) => p.birthday);
  const todayBirthdays = [];
  const upcoming = [];

  for (const p of roles) {
    const bd = parseBirthday(p.birthday);
    if (!bd) continue;
    const days = daysUntil(bd, today);
    if (bd.month === todayM && bd.day === todayD) {
      todayBirthdays.push({ title: p.title, birthday: p.birthday });
    } else {
      upcoming.push({ title: p.title, birthday: p.birthday, days, month: bd.month, day: bd.day });
    }
  }

  // 最近的下一个生日(按 days 升序)
  upcoming.sort((a, b) => a.days - b.days || a.month - b.month || a.day - b.day);
  const next = upcoming.length ? upcoming[0] : null;

  return {
    todayBirthdays,
    nextBirthday: next,
    totalWithBirthday: roles.length,
  };
}

module.exports = { parseBirthday, daysUntil, birthdayInfo };
