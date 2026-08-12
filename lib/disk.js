'use strict';

const fs = require('fs');
const path = require('path');

const MIN_FREE = 5 * 1024 * 1024 * 1024; // 5GB 阈值

const CONTENT_DIR = path.resolve(process.cwd(), process.env.CONTENT_DIR || 'content');
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');

// 获取目录所在文件系统的剩余/总字节。
function getDiskStats(dir) {
  if (typeof fs.statfsSync === 'function') {
    const s = fs.statfsSync(dir);
    return { free: s.bsize * s.bavail, total: s.bsize * s.blocks };
  }
  // 回退:df -k 解析剩余 KB
  const { execSync } = require('child_process');
  const out = execSync(`df -k "${dir}"`).toString().split('\n')[1].trim().split(/\s+/);
  // df 输出:Filesystem 1K-blocks Used Available Use% Mounted
  return { free: parseInt(out[3], 10) * 1024, total: parseInt(out[1], 10) * 1024 };
}

// 递归统计目录实际占用字节。
function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += dirSize(fp);
    } else if (entry.isFile()) {
      total += fs.statSync(fp).size;
    }
  }
  return total;
}

// 数据目录已占用字节(词条 + 媒体 + 元数据)。
function usedBytes() {
  return dirSize(CONTENT_DIR) + dirSize(DATA_DIR);
}

// 加上 extra 字节后剩余空间。返回负数表示已超出。
function freeAfter(extraBytes) {
  const { free } = getDiskStats(CONTENT_DIR);
  return free - usedBytes() - (extraBytes || 0);
}

module.exports = { MIN_FREE, getDiskStats, usedBytes, freeAfter };
