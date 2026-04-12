/**
 * Rendering layer — output formatting for JSON IR objects.
 *
 * Converts JSON IR into HTML5 and Markdown strings.
 * Pure functions with no external dependencies.
 */

// ── HTML5 Rendering ────────────────────────────────────────────────

/**
 * Generate HTML5 from JSON IR.
 *
 * @param {object} ir - JSON IR object
 * @returns {string} HTML5 string
 */
export function renderHtml5(ir) {
  const head = `<!DOCTYPE html><html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ir.title)}</title>
  <link rel="stylesheet" href="../styles/normalized.css">
</head>`;

  let body = '<body>\n  <article>\n';
  body += `    <h1>${escapeHtml(ir.title)}</h1>\n`;

  if (ir.docType === 'catalog' && ir.navItems.length > 0) {
    body += '  <nav class="mt-8"><ul class="space-y-2">';
    for (const item of ir.navItems) {
      body += `<li class="font-kai text-mo-600"><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
    }
    body += '</ul></nav>';
  } else if (ir.docType === 'content') {
    for (const chapter of ir.chapters) {
      if (chapter.title) {
        body += `<h2 class="font-li text-xl text-dai-500 mt-8 mb-4">${escapeHtml(chapter.title)}</h2>`;
      }

      let sectionOpen = false;
      for (const section of chapter.sections) {
        if (section.type === 'main-text') {
          if (sectionOpen) body += '</section>';
          body += '<section class="mt-8 pt-8 border-t border-border-secondary">';
          sectionOpen = true;

          let paraContent = escapeHtml(section.content);
          if (section.annotations && section.annotations.length > 0) {
            for (const ann of section.annotations) {
              paraContent += ` <span class="annotation">${escapeHtml(ann.text)}</span>`;
            }
          }
          body += `<p class="font-kai leading-loose text-mo-600">${paraContent}</p>`;
        } else if (section.type === 'section-summary') {
          body += `<p class="font-kai italic text-sm text-dai-400">${escapeHtml(section.content)}</p>`;
        } else if (section.type === 'colophon') {
          if (sectionOpen) {
            body += '</section>';
            sectionOpen = false;
          }
          body += `<section class="colophon"><p class="font-kai text-sm">${escapeHtml(section.content)}</p></section>`;
        }
      }
      if (sectionOpen) body += '</section>';
    }
  }

  body += '  </article>\n</body></html>';
  return head + body;
}

/**
 * Generate Markdown from JSON IR.
 *
 * @param {object} ir - JSON IR object
 * @returns {string} Markdown string with frontmatter
 */
export function renderMarkdown(ir) {
  const categoryMatch = ir.source.match(/^([^/]+)/);
  const category = categoryMatch ? categoryMatch[1] : undefined;

  let md = '---\n';
  md += `title: "${escapeYaml(ir.title)}"\n`;
  md += `docType: "${ir.docType}"\n`;
  if (category) md += `category: "${category}"\n`;
  if (ir.author) md += `author: "${escapeYaml(ir.author)}"\n`;
  if (ir.dynasty) md += `dynasty: "${escapeYaml(ir.dynasty)}"\n`;
  md += `date: "${new Date().toISOString().split('T')[0]}"\n`;
  md += `source: "${ir.source}"\n`;
  md += '---\n\n';

  if (ir.docType === 'catalog' && ir.navItems.length > 0) {
    for (const item of ir.navItems) {
      md += `* [${item.label}](${item.href})\n`;
    }
  } else if (ir.docType === 'content') {
    let footnoteCounter = 0;
    const footnotes = [];

    for (const chapter of ir.chapters) {
      if (chapter.title) {
        md += `\n## ${chapter.title}\n\n`;
      }

      for (const section of chapter.sections) {
        if (section.type === 'main-text') {
          let paraText = escapeMarkdown(section.content);

          if (section.annotations && section.annotations.length > 0) {
            for (const ann of section.annotations) {
              footnoteCounter++;
              paraText += `[^注${footnoteCounter}]`;
              footnotes.push(`[^注${footnoteCounter}]: ${ann.text}`);
            }
          }

          md += `${paraText}\n\n`;
        } else if (section.type === 'section-summary') {
          md += `*${section.content}*\n\n`;
        } else if (section.type === 'colophon') {
          md += `${section.content}\n\n`;
        }
      }
    }

    if (footnotes.length > 0) {
      md += footnotes.join('\n') + '\n';
    }
  }

  return md;
}

// ── Escape Helpers ─────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeYaml(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function escapeMarkdown(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#')
    .replace(/`/g, '\\`');
}
