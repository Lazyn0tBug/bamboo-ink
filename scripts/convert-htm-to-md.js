#!/usr/bin/env node
/**
 * 古籍 HTML 转 Markdown 转换脚本
 * 
 * 功能:
 * 1. 批量读取 HTML 文件
 * 2. 检测并转换编码 (GBK→UTF-8)
 * 3. 提取标题、正文、章节结构
 * 4. 清理过时标签和内联样式
 * 5. 转换为 Markdown + Frontmatter
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import cheerio from 'cheerio';
import TurndownService from 'turndown';
import iconv from 'iconv-lite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, '../../data/古籍');
const TARGET_DIR = path.join(__dirname, '../content');

// 创建 Turndown 服务
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// 保留特定的 HTML 结构
turndownService.keep(['pre']);

// 自定义规则：处理古籍特定的标签
turndownService.addRule('guji-title', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: function (content, node, options) {
    const hLevel = node.tagName.charAt(1);
    const hPrefix = '#'.repeat(Number(hLevel));
    return `\n\n${hPrefix} ${content.trim()}\n\n`;
  },
});

// 检测文件编码
function detectEncoding(buffer) {
  // 检查 BOM
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf8';
  }
  
  // 尝试 UTF-8
  try {
    const text = buffer.toString('utf8');
    if (/[\u4e00-\u9fa5]/.test(text)) {
      return 'utf8';
    }
  } catch (e) {
    // ignore
  }
  
  // 默认 GBK
  return 'gbk';
}

// 提取元数据
function extractMetadata($, filePath) {
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                path.basename(filePath, '.htm');
  
  const section = filePath.includes('/经部') ? '经' :
                  filePath.includes('/史部') ? '史' :
                  filePath.includes('/子部') ? '子' :
                  filePath.includes('/集部') ? '集' : '其他';
  
  return {
    title,
    section,
    date: new Date().toISOString().split('T')[0],
    source: filePath,
  };
}

// 清理 HTML
function cleanHtml($) {
  // 移除脚本和样式
  $('script, style, link, meta').remove();
  
  // 移除过时标签但保留内容
  $('font, center, span').each((_, el) => {
    $(el).replaceWith($(el).html());
  });
  
  // 转换 pre 标签
  $('pre').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`<div class="verse">${text}</div>`);
  });
  
  // 保留正文内容
  const body = $('body').html() || $.html();
  return body;
}

// 转换单个文件
async function convertFile(filePath) {
  try {
    console.log(`处理：${filePath}`);
    
    // 读取文件
    const buffer = await fs.readFile(filePath);
    
    // 检测编码
    const encoding = detectEncoding(buffer);
    console.log(`  编码：${encoding}`);
    
    // 转换为 UTF-8
    const html = encoding === 'gbk' 
      ? iconv.decode(buffer, 'gbk')
      : buffer.toString('utf8');
    
    // 解析 HTML
    const $ = cheerio.load(html);
    
    // 提取元数据
    const metadata = extractMetadata($, filePath);
    
    // 清理 HTML
    const cleanedHtml = cleanHtml($);
    
    // 转换为 Markdown
    const markdown = turndownService.turndown(cleanedHtml);
    
    // 生成 Frontmatter
    const frontmatter = `---
title: "${metadata.title}"
section: "${metadata.section}"
date: "${metadata.date}"
source: "${metadata.source}"
---

`;
    
    // 生成目标文件路径
    const relativePath = path.relative(SOURCE_DIR, filePath);
    const targetPath = path.join(
      TARGET_DIR,
      metadata.section,
      relativePath.replace(/\.htm[l]?$/, '.md')
    );
    
    // 确保目录存在
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    
    // 写入文件
    await fs.writeFile(targetPath, frontmatter + markdown, 'utf8');
    
    console.log(`  ✓ 完成：${targetPath}`);
    return true;
  } catch (error) {
    console.error(`  ✗ 错误：${error.message}`);
    return false;
  }
}

// 主函数
async function main() {
  console.log('🚀 古籍 HTML 转 Markdown 转换工具\n');
  
  // 确保目标目录存在
  await fs.mkdir(TARGET_DIR, { recursive: true });
  
  // 查找所有 HTML 文件
  const files = [];
  async function findFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await findFiles(fullPath);
      } else if (entry.isFile() && /\.(htm|html)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  
  await findFiles(SOURCE_DIR);
  
  console.log(`找到 ${files.length} 个 HTML 文件\n`);
  
  // 转换文件
  let success = 0;
  let failed = 0;
  
  for (const file of files.slice(0, 10)) { // 先处理前 10 个作为样板
    const result = await convertFile(file);
    if (result) {
      success++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n✅ 转换完成`);
  console.log(`成功：${success} 文件`);
  console.log(`失败：${failed} 文件`);
}

// 运行
main().catch(console.error);
